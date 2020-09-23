# DevOps automation

This project is about resources helping automate and improve DevOps processes.

## Assumptions / Key notes
* IAM user has defined his/her email in a tag with the "email" key. So we can send emails in case of pull requests.
* We use only npm and `package.json` to deploy/install... we hardcoded `yarn` for now to build lambdas, so if you use npm, just replace `yarn install` to `npm install`
* AWS SES needs to be configured and ready to send emails. Configuration of the email address is in `iac/index.ts`.


## Covering areas / usecases

### PullRequest notification
When there is some change on pull request it sends info email to an approver defined on a pull request.

__Note__: approver for pull request needs to be added manually as the IAM user name. Or we can create an approver template for a repository, but there is no support for this in CloudFormation, so it needs to be created manually too.

### Code Pipeline failed notification
When there is a commit that makes the pipeline failed, it sends an email notification to a committer of the commit.

## Deployment
Configure your account and email address in `iac/index.ts`, set localDeploy to true and run:
`yarn install && yarn aws:dev`

## CD deployment
Configure your account and in `iac/index.ts` and run:
`yarn install && yarn deploy:dev:cd`
