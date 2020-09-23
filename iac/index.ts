import * as cdk from '@aws-cdk/core';
import * as path from 'path';
import * as lambda from '@aws-cdk/aws-lambda';
import * as cd from './cdPipeline';
import * as app from './mainApp';

const projectName = 'devops-automation';

const cdkApp = new cdk.App();
const localDeploy = true; // never commit as true

/** *************************************************
 * DEV
 *********************************************** */
const devEnv = {
    region: 'eu-west-1',
    account: '8888888888',
};
const lambda1Code = localDeploy ? lambda.Code.fromAsset(path.join(__dirname, '../src/EventHandler')) : lambda.Code.fromCfnParameters();

/**
 * APP stacks
 */
const appStackPropsDev = {
    stackName: `dev-${projectName}`,
    stage: 'dev',
    development: true,
    debug: true,
    env: devEnv,
    lambda1Code,
    notificationEmail: 'devops@xyz.eu',
    repositories: ['all'],
};
// stack for deployment from local machine (cdk deploy), the same stack is defined in also in Pipeline as a part of CD
const devAppStack = new app.AppStack(cdkApp, appStackPropsDev.stackName, appStackPropsDev);
cdk.Tags.of(devAppStack).add('component', 'devop-automation');
cdk.Tags.of(devAppStack).add('stage', 'dev');
cdk.Tags.of(devAppStack).add('type', 'devops');

if (!localDeploy) {
    /**
     * CD - codepeline stack
     */
    const devApiDevopsStack = new cd.PipelineStack(cdkApp, `${appStackPropsDev.stackName}-cd-pipeline`, {
        stackName: `${appStackPropsDev.stackName}-cd-pipeline`,
        stage: 'dev',
        env: devEnv,
        repo: {
            github: {
                oauthToken: cdk.SecretValue.secretsManager('github', { jsonField: 'github' }),
                branch: 'develop',
                repo: 'example-aws-devops-automation',
                owner: 'robo-sk',
            },
        },
        appStackProps: appStackPropsDev,
    });
    cdk.Tags.of(devApiDevopsStack).add('component', 'devop-automation');
    cdk.Tags.of(devApiDevopsStack).add('stage', 'dev');
    cdk.Tags.of(devApiDevopsStack).add('type', 'devops');
}

cdkApp.synth();
