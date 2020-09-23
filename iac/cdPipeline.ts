import * as lambda from '@aws-cdk/aws-lambda';
import * as codebuild from '@aws-cdk/aws-codebuild';
import * as codecommit from '@aws-cdk/aws-codecommit';
import * as codepipeline from '@aws-cdk/aws-codepipeline';
import * as cpactions from '@aws-cdk/aws-codepipeline-actions';
import * as iam from '@aws-cdk/aws-iam';
import * as cdk from '@aws-cdk/core';
import * as cicd from '@aws-cdk/app-delivery';
import * as app from './mainApp';

export interface GithubRepoConfig{
    readonly owner: string;
    readonly repo: string;
    readonly branch: string;
    readonly oauthToken: cdk.SecretValue;
}
export interface CodecommitRepoConfig{
    readonly repoName: string;
    readonly branch: string;
}
export interface RepoConfig {
    readonly codecommit?: CodecommitRepoConfig;
    readonly github?: GithubRepoConfig;
}

/**
 * Specification of connection to RDS (serverless aurora)
 */
export interface PipelineProps extends cdk.StackProps {
    /**
     * source repository configuration
     */
    readonly repo: RepoConfig;

    /**
     * stage name so we know what and where to deploy
     */
    readonly stage: string;

    /**
     * properties of app.AuthzAppStack - needs to be the same as for deployment from local machine to make it work
     */
    readonly appStackProps: app.AppStackProps;

}

/**
 * Primary stack for creating CD pipeline
 * @todo - it's not stright forward when using lambdaCode cfn parameters, but there is no other way for now. Aws Cdk team has it in the pipeline - https://docs.aws.amazon.com/cdk/api/latest/docs/app-delivery-readme.html
 */
export class PipelineStack extends cdk.Stack {
    constructor(cdkApp: cdk.App, id: string, props: PipelineProps) {
        super(cdkApp, id, props);

        const lambda1Code = (props.appStackProps.lambda1Code instanceof lambda.CfnParametersCode) ? props.appStackProps.lambda1Code : lambda.Code.fromCfnParameters();

        // CODE BUILD
        const cdkBuild = new codebuild.PipelineProject(this, 'CdkBuild', {
            buildSpec: codebuild.BuildSpec.fromObject({
                version: '0.2',
                phases: {
                    install: {
                        commands: [
                            'node -v',
                            'yarn install',
                            'npx cdk --version',
                            'yarn build-prod-fns',
                        ],
                    },
                    pre_build: {
                        commands: [
                            'yarn eslint:no-tests',
                        ],
                    },
                    build: {
                        commands: [
                            `npx cdk synth ${props.stage}-*`,
                        ],
                    },
                },
                artifacts: {
                    'secondary-artifacts': {
                        lambda1Files: {
                            'base-directory': './src/EventHandler',
                            files: ['**/*'],
                            name: 'lambda1Files',
                        },
                        cdkout: {
                            'base-directory': './cdk.out',
                            files: ['**/*'],
                            name: 'cdkout',
                        },
                    },
                },
            }),
            projectName: this.stackName,
            environment: {
                buildImage: codebuild.LinuxBuildImage.STANDARD_4_0,
            },
            environmentVariables: {
                GITHUB_TOKEN: {
                    value: 'github:github',
                    type: codebuild.BuildEnvironmentVariableType.SECRETS_MANAGER,
                },
            },
        });
        cdkBuild.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'secretsmanager:GetSecretValue',
            ],
            resources: ['arn:aws:secretsmanager:eu-west-1:*:secret:github*'],
        }));

        // DEFINE OUTPUTS
        const sourceOutput = new codepipeline.Artifact();
        const lambda1Output = new codepipeline.Artifact('lambda1Files');
        const cdkoutOutput = new codepipeline.Artifact('cdkout');

        // DEFINE PIPELINE AND STAGES
        new codepipeline.Pipeline(this, 'Pipeline', {
            pipelineName: `${props.stackName}`,
            restartExecutionOnUpdate: true,
            stages: [
                {
                    stageName: 'Source',
                    actions: [
                        ...(props.repo.codecommit
                            ? [new cpactions.CodeCommitSourceAction({
                                actionName: 'CodeCommit_Source',
                                repository: codecommit.Repository.fromRepositoryName(this, 'Repo', props.repo.codecommit.repoName),
                                output: sourceOutput,
                                branch: props.repo.codecommit.branch,
                            })] : []),
                        ...(props.repo.github
                            ? [new cpactions.GitHubSourceAction({
                                actionName: 'GitHub_Source',
                                owner: props.repo.github.owner,
                                repo: props.repo.github.repo,
                                oauthToken: props.repo.github.oauthToken,
                                output: sourceOutput,
                                branch: props.repo.github.branch,
                                trigger: cpactions.GitHubTrigger.WEBHOOK,
                            })] : []),
                    ],
                },
                {
                    stageName: 'Build',
                    actions: [
                        new cpactions.CodeBuildAction({
                            actionName: 'CdkSynth.And.Build',
                            project: cdkBuild,
                            input: sourceOutput,
                            outputs: [lambda1Output, cdkoutOutput],

                        }),
                    ],
                },
                {
                    stageName: 'SelfPipelineUpdate',
                    actions: [
                        new cicd.PipelineDeployStackAction({
                            stack: this,
                            input: cdkoutOutput,
                            adminPermissions: true,
                        }),
                    ],
                },
                {
                    stageName: 'Deploy',
                    actions: [
                        // Note: because of current limitations, no NestedStacks are supported. Aws team is working on it. ( https://docs.aws.amazon.com/cdk/api/latest/docs/app-delivery-readme.html )
                        new cpactions.CloudFormationCreateUpdateStackAction({
                            actionName: 'DeployStack',
                            templatePath: cdkoutOutput.atPath(`${props.appStackProps.stackName}.template.json`),
                            stackName: `${props.appStackProps.stackName}`,
                            adminPermissions: true,
                            parameterOverrides: {
                                ...lambda1Code.assign(lambda1Output.s3Location),
                            },
                            extraInputs: [lambda1Output, cdkoutOutput],
                        }),
                    ],
                },
            ],
        });
    }
}
