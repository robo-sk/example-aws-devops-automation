const AWS = require('aws-sdk');
const log = require('./util/log');
const cc = require('./services/codecommit');
const cp = require('./services/codepipeline');
const iam = require('./services/iam');
const ses = require('./services/ses');

/**
 * Handle pul request event
 * @param {object} record
 * @param {object} message
 */
const processPullRequestEvent = async (record, message) => {
    let resp;
    const { payload } = message || {};
    const { pullRequestId } = payload || {};
    if (pullRequestId) {
        try {
            const users = await cc.getPullRequestApprovers({ pullRequestId }) || [];
            const emails = await iam.getUserEmails(users) || [];
            resp = await ses.sendEmails({
                templateId: 'PullRequest',
                emails,
                params: {
                    ...payload,
                },
            });
            log.debug('emeil sent', resp);
        } catch (e) {
            log.error('Error sending emails', e);
            throw e;
        }
    }
    return resp;
};

/**
 * Handle codepipeline event
 * @param {object} record
 * @param {object} message
 */
const processPipelineEvent = async (record, message) => {
    let resp;
    const { payload } = message || {};
    const { state, pipeline } = payload || {};
    const executionId = (payload || {})['execution-id'];
    if (state === 'FAILED') {
        try {
            const sourceCommits = await cp.getCommitInfoForPipeline(executionId, pipeline);
            if (sourceCommits && sourceCommits.length > 0) {
                const promises = sourceCommits.map(async (commitDesc) => {
                    const commit = await cc.getCommit(commitDesc);
                    const { email } = ((commit || {}).commit || {}).committer;
                    let emailSent = false;
                    if (email && email.length > 0) {
                        await ses.sendEmails({
                            templateId: 'PipelineFailed',
                            emails: [email],
                            params: {
                                ...commitDesc,
                                authorName: commit.commit.author.name,
                                committerName: commit.commit.committer.name,
                            },
                        });
                        emailSent = true;
                    }
                    return emailSent;
                });
                // wait for all promises to finish
                const data = await Promise.allSettled(promises);
                // just log info about processing
                data.forEach((result) => {
                    if (result.status === 'rejected') {
                        log.error('Error processing pipeline event.', result.reason);
                    } else {
                        log.info('Processing of pipeline event done.', result.value);
                    }
                });
                resp = data;
            }
        } catch (e) {
            log.error('Error processing pipeline events', e);
            throw e;
        }
    }
    return resp;
};

const processCommitEvent = async (record, message) => {
    log.debug('Processing commit event.', message);
};
const processOtherCodeCommmitEvent = async (record, message) => {
    log.debug('Other CodeCommit events not implemented.', message);
};
const processCodeBuildEvent = async (record, message) => {
    log.debug('CodeBuild event not implemented.', message);
};

/**
 * test for SNS record
 * @param {any} record
 */
const isSnsRecord = (record) => record.EventSource === 'aws:sns' && !!record.Sns;

/**
 * Helper to create handler for lambda
 * @param {any} options
 */
const createHandler = (options) => async (event, context) => {
    log.debug('Starting with event', event);
    const { Records } = event;

    // process all records by type in parallel
    if (Records && Records.length > 0) {
        // NOTE: SNS has always just single record, let's just keep the pattern for multiple records for later use
        const promises = Records.map((record) => {
            if (isSnsRecord(record)) {
                const message = (record.Sns.Message && JSON.parse(record.Sns.Message)) || {};
                const route = options.sns.find((rt) => rt.testType(record, message));
                if (route) {
                    return route.action(record, message);
                }
                log.warn('No matching route for record:', record);
            }
            return undefined;
        }).filter((p) => !!p);

        const errResults = await Promise.allSettled(promises).then((res) => res.filter((r) => r.status === 'rejected'));
        errResults.forEach((err) => log.error('Unable to process record:', err));
    }
};

/**
 * main lambda handler
 */
exports.lambdaHandler = createHandler({
    sns: [
        {
            testType: (record, message) => {
                const ccEvent = (message.payload || {}).event;
                return message.type === 'codecommit' && ccEvent === 'referenceCreated';
            },
            action: processCommitEvent,
        }, {
            testType: (record, message) => {
                const ccEvent = (message.payload || {}).event;
                return message.type === 'codecommit' && (ccEvent === 'pullRequestApprovalRuleCreated' || ccEvent === 'pullRequestApprovalRuleOverridden' || ccEvent === 'pullRequestApprovalRuleUpdated');
            },
            action: processPullRequestEvent,
        }, {
            testType: (record, message) => {
                const ccEvent = (message.payload || {}).event;
                return message.type === 'codecommit' && (ccEvent === 'pullRequestCreated' || ccEvent === 'pullRequestStatusChanged');
            },
            action: processPullRequestEvent,
        }, {
            testType: (record, message) => message.type === 'codecommit',
            action: processOtherCodeCommmitEvent,
        }, {
            testType: (record, message) => message.type === 'codebuild',
            action: processCodeBuildEvent,
        }, {
            testType: (record, message) => message.type === 'codepipeline',
            action: processPipelineEvent,
        },
    ],
});
