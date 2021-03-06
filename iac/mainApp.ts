import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as sns from '@aws-cdk/aws-sns';
import * as subscriptions from '@aws-cdk/aws-sns-subscriptions';
import * as events from '@aws-cdk/aws-events';
import * as targets from '@aws-cdk/aws-events-targets';
import * as codecommit from '@aws-cdk/aws-codecommit';
import * as ses from '@aws-cdk/aws-ses';
import * as iam from '@aws-cdk/aws-iam';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Specific properties for this stack
 */
export interface AppStackProps extends cdk.StackProps {
    /**
     * development indicator so some permissions and settings can be slightly modified
     */
    readonly development: boolean;
    /**
     * stage (env) of all infra (dev, test, prod, ...)
     */
    readonly stage: string;
    /**
     * required to provide for CodePipeline deployment as CfnParametersCode.
     */
    readonly lambda1Code: lambda.AssetCode | lambda.CfnParametersCode;
    /**
     * notification email
     */
    readonly notificationEmail: string;
    /**
     * repositories to monitor. You can specify 'all' to monitor all repositories
     */
    readonly repositories: string[];

}

/**
 * main stack
 */
export class AppStack extends cdk.Stack {
    constructor(app: cdk.Construct, id: string, props: AppStackProps) {
        super(app, id, props);
        const account = props?.env?.account || cdk.Aws.ACCOUNT_ID;
        const region = props?.env?.region || cdk.Aws.REGION;
        const templateArnPrefix = `arn:${cdk.Aws.PARTITION}:ses:${region}:${account}:template/`;

        // FUNCTIONS
        const eventsHandlerFunction = new lambda.Function(this, 'DevopsEventHandler', {
            code: props.lambda1Code,
            handler: 'index.lambdaHandler',
            runtime: lambda.Runtime.NODEJS_12_X,
            timeout: cdk.Duration.seconds(10),
            environment: {
                DEBUG: `${props.development}`,
                TEMPLATE_ARN_PREFIX: templateArnPrefix,
                EMAIL_FROM: props.notificationEmail,
            },
        });
        eventsHandlerFunction.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['ses:SendTemplatedEmail'],
            resources: ['*'],
        }));
        eventsHandlerFunction.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['iam:GetUser'],
            resources: ['*'],
        }));

        const devopsEvents = new sns.Topic(this, 'DevopsEvents', {
            topicName: `${props.stage}-devops-events`,
            displayName: 'Events for devops processing',
        });
        devopsEvents.addSubscription(new subscriptions.LambdaSubscription(eventsHandlerFunction));

        // codecommit rules
        if (props.repositories.indexOf('all') > -1) {
            const ccRule = new events.Rule(this, 'codecommit-eventrule', {
                description: 'Rule to forward all codecommit events to DevopsEvents SNS',
                ruleName: `${props.stage}-DevopsCodeCommit`,
                eventPattern: {
                    source: ['aws.codecommit'],
                },
            });
            ccRule.addTarget(new targets.SnsTopic(devopsEvents, {
                // NOTE: format needs to reflect implemantation in lambda
                message: events.RuleTargetInput.fromObject({
                    type: 'codecommit',
                    payload: events.EventField.fromPath('$.detail'),
                }),

            }));
            const ccRoPolicy = iam.ManagedPolicy.fromAwsManagedPolicyName('AWSCodeCommitReadOnly');
            if (eventsHandlerFunction.role) {
                eventsHandlerFunction.role.addManagedPolicy(ccRoPolicy);
            }
        } else {
            props.repositories.forEach((repository) => {
                const repo = codecommit.Repository.fromRepositoryName(this, `Repo~${repository}`, repository);
                repo.onEvent('cc_event').addTarget(new targets.SnsTopic(devopsEvents, {
                // NOTE: format needs to reflect implemantation in lambda
                    message: events.RuleTargetInput.fromObject({
                        type: 'codecommit',
                        payload: events.EventField.fromPath('$.detail'),
                    }),
                }));
                repo.grantRead(eventsHandlerFunction);
            });
        }

        // codebuild rule
        const cbRule = new events.Rule(this, 'codebuild-eventrule', {
            description: 'Rule to forward all codebuild events to DevopsEvents SNS',
            ruleName: `${props.stage}-DevopsCodeBuild`,
            eventPattern: {
                source: ['aws.codebuild'],
            },
        });
        cbRule.addTarget(new targets.SnsTopic(devopsEvents, {
            // NOTE: format needs to reflect implemantation in lambda
            message: events.RuleTargetInput.fromObject({
                type: 'codebuild',
                payload: events.EventField.fromPath('$.detail'),
            }),
        }));

        // codepipeline rule
        const cpRule = new events.Rule(this, 'codepipeline-eventrule', {
            description: 'Rule to forward all codepipeline events to DevopsEvents SNS',
            ruleName: `${props.stage}-DevopsCodePipeline`,
            eventPattern: {
                source: ['aws.codepipeline'],
            },
        });
        cpRule.addTarget(new targets.SnsTopic(devopsEvents, {
            // NOTE: format needs to reflect implemantation in lambda
            message: events.RuleTargetInput.fromObject({
                type: 'codepipeline',
                payload: events.EventField.fromPath('$.detail'),
            }),
        }));
        const cpRoPolicy = iam.ManagedPolicy.fromAwsManagedPolicyName('AWSCodePipelineReadOnlyAccess');
        if (eventsHandlerFunction.role) {
            eventsHandlerFunction.role.addManagedPolicy(cpRoPolicy);
        }

        // templates
        const pullRequestTemplate = new ses.CfnTemplate(this, 'PullRequestSesTemplate', {
            template: {
                templateName: 'PullRequest',
                htmlPart: AppStack.getTemplate('PullRequest'),
                subjectPart: 'Pull Request notification - {{pullRequestId}}',
            },
        });
        const pipelineFailedTemplate = new ses.CfnTemplate(this, 'PipelineFailedSesTemplate', {
            template: {
                templateName: 'PipelineFailed',
                htmlPart: AppStack.getTemplate('PipelineFailed'),
                subjectPart: 'CodePipeline notification - FAILED',
            },
        });

        new cdk.CfnOutput(this, 'PullRequestTemplate', { value: `${templateArnPrefix}${pullRequestTemplate.ref}` });
        new cdk.CfnOutput(this, 'PipelineFailedTemplate', { value: `${templateArnPrefix}${pipelineFailedTemplate.ref}` });
    }

    static getTemplate(templateId:string) {
        return fs.readFileSync(path.join(__dirname, `../emailTemplates/${templateId}.html`), { encoding: 'utf-8' });
    }
}
