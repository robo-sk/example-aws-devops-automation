const AWS = require('aws-sdk');
const log = require('./util/log');
const cc = require('./services/codecommit');
const cp = require('./services/codepipeline');
const iam = require('./services/iam');
const ses = require('./services/ses');

/**
 * Handle pul request event
 * @param {object} payload
 */
const processPullRequestEvent = async (payload) => {
    let resp;
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
        } catch (e) {
            log.error('Error sending emails', e);
            throw e;
        }
    }
    return resp;
};

/**
 * Handle pul request event
 * @param {object} payload
 */
const processPipelineEvent = async (payload) => {
    let resp;
    const { state, pipeline } = payload || {};
    const executionId = (payload || {})['execution-id'];
    if (state === 'FAILED') {
        try {
            log.debug('payload', payload);
            const sourceCommits = await cp.getCommitInfoForPipeline(executionId, pipeline);
            if (sourceCommits && sourceCommits.length > 0) {
                const promises = sourceCommits.map(async (commitDesc) => {
                    const commit = await cc.getCommit(commitDesc);
                    log.debug('got commit', commit);
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

/**
 * lambda handler listening on SNS event
 */
exports.lambdaHandler = async (event) => {
    try {
        log.debug('Starting with event', event);
        const { Records } = event;

        // process all records by type in parallel
        if (Records && Records.length > 0) {
            const promises = [];
            // NOTE: SNS has always just single record, let's just keep the pattern for multiple records for later use
            Records.forEach((record) => {
                if (record.Sns) {
                    const message = record.Sns.Message && JSON.parse(record.Sns.Message);
                    // PROCESS by high level TYPE
                    if (message && message.type === 'codecommit') {
                        const { payload } = message;
                        const ccEvent = payload.event;
                        // PROCESS by event type
                        if (ccEvent === 'referenceCreated' || ccEvent === 'referenceCreated ') {
                            log.debug('Processing commit event.', message);
                            // no action for now
                        } else if (ccEvent === 'pullRequestApprovalRuleCreated' || ccEvent === 'pullRequestApprovalRuleOverridden' || ccEvent === 'pullRequestApprovalRuleUpdated') {
                            log.debug('Processing approvalrule event.', message);
                            promises.push(processPullRequestEvent(payload));
                        } else if (ccEvent === 'pullRequestCreated' || ccEvent === 'pullRequestStatusChanged') {
                            log.debug('Processing pullrequest event.', message);
                            promises.push(processPullRequestEvent(payload));
                        } else {
                            // don't care about this event
                            log.debug('Not processing.', message);
                        }
                    } else if (message && message.type === 'codebuild') {
                        const { payload } = message;
                        log.debug('Processing codebuild event', message);
                    } else if (message && message.type === 'codepipeline') {
                        const { payload } = message;
                        log.debug('Processing codepipeline event', message);
                        promises.push(processPipelineEvent(payload));
                    }
                }
            });

            // wait for all promises to finish
            const data = await Promise.allSettled(promises);

            // just log info about processing
            data.forEach((result) => {
                if (result.status === 'rejected') {
                    log.error('Error processing event.', result.reason);
                } else {
                    log.info('Processing done.', result.value);
                }
            });
        }
    } catch (err) {
        log.error('Error processing event.', err);
        return err;
    }
    return 'done';
};
