const AWS = require('aws-sdk');
const log = require('../util/log');

const codecommit = new AWS.CodeCommit();

/**
 * Get code commit COMMIT description object
 * @param {Object} param0
 * @param {string} param0.commitId commit id
 * @param {string} param0.repositoryName code commit repository name
 */
const getCommit = async ({ commitId, repositoryName }) => {
    const params = {
        commitId,
        repositoryName,
    };
    return codecommit.getCommit(params).promise();
};

const getPullRequest = async ({ pullRequestId }) => {
    const params = {
        pullRequestId,
    };
    return codecommit.getPullRequest(params).promise();
};

const PREFIX_APPROVERS = 'CodeCommitApprovers:';
/**
 * Get list of approvers for pull request
 * @param {object} param contains pullRequestId as property
 * @param {string} param.pullRequestId pull request ID
 */
const getPullRequestApprovers = async ({ pullRequestId }) => {
    const prResp = await getPullRequest({ pullRequestId });
    log.debug('Pull request loaded.', prResp);
    const rules = ((prResp || {}).pullRequest || {}).approvalRules || [];
    const iamUserNames = [];
    if (rules && rules.length > 0) {
        rules.forEach((rule) => {
            const content = JSON.parse(rule.approvalRuleContent || {});
            (content.Statements || []).forEach((statement) => {
                if (statement && statement.Type === 'Approvers') {
                    const members = statement.ApprovalPoolMembers || [];
                    members.forEach((member) => {
                        if (member && member.indexOf(PREFIX_APPROVERS) > -1) {
                            iamUserNames.push(member.substring(member.indexOf(PREFIX_APPROVERS) + PREFIX_APPROVERS.length));
                        }
                    });
                }
            });
        });
    }
    return iamUserNames;
};

exports.getPullRequestApprovers = getPullRequestApprovers;
exports.getCommit = getCommit;
