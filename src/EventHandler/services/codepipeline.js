const AWS = require('aws-sdk');
const log = require('../util/log');

const codepipeline = new AWS.CodePipeline();

// const getPipelineExecution = async (pipelineExecutionId, pipelineName) => {
//     const params = {
//         pipelineExecutionId,
//         pipelineName,
//     };
//     return codepipeline.getPipelineExecution(params).promise();
// };

const listActionExecutions = async (pipelineExecutionId, pipelineName) => {
    const params = {
        filter: {
            pipelineExecutionId,

        },
        pipelineName,
    };
    // no next token... we suppose 100 default max is enoughs
    return codepipeline.listActionExecutions(params).promise();
};

/**
 * Get commit info (revision object) from pipeline execution
 * @param {Object} param
 * @param {string} param.pipelineExecutionId pipeline execution id
 * @param {string} param.pipelineName pipeline name
 * @returns {Object[]} [{branchName, commitId, commitMessage, committerDate, repositoryName},...]
 */
const getCommitInfoForPipeline = async (pipelineExecutionId, pipelineName) => {
    let resp;
    const actions = await listActionExecutions(pipelineExecutionId, pipelineName);

    if (actions && actions.actionExecutionDetails && actions.actionExecutionDetails.length > 0) {
        const sourceActions = actions.actionExecutionDetails.filter((action) => action.actionName === 'Source');
        const sourceCommits = sourceActions.map((action) => {
            if ((((action || {}).output || {}).outputVariables || {}).CommitId) {
                return {
                    branchName: action.output.outputVariables.BranchName,
                    commitId: action.output.outputVariables.CommitId,
                    commitMessage: action.output.outputVariables.CommitMessage,
                    committerDate: action.output.outputVariables.CommitterDate,
                    repositoryName: action.output.outputVariables.RepositoryName,
                };
            }
            return undefined;
        });
        resp = sourceCommits;
    }

    log.debug('sourceCommits', resp);
    return resp;
};
exports.getCommitInfoForPipeline = getCommitInfoForPipeline;
