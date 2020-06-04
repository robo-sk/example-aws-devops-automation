# DevOps automation - Example

This project is about resources helping automate and improve DevOps processes.

## Assumptions / Key notes
* IAM user has defined his/her email in a tag with the "email" key. So we can send emails in case of pull requests.
* We use only npm and `package.json` to deploy/install... we hardcoded `npm` for now to build lambdas, so if you use yarn, just replace `npm install` to `yarn install`
* AWS SES needs to be configured and ready to send emails


## Covering areas / usecases

### PullRequest notification
When there is some change on pull request it sends info email to approver defined on a pull request.

__Note__: approver for pull request needs to be added manually as the IAM user name. Or we can create an approver template for a repository, but there is no support for this in CloudFormation, so it needs to be created manually too.

### Code Pipeline failed notification
When there is a commit that makes the pipeline failed, it sends an email notification to a committer of the commit.

## Deployment

`npm install && npm run aws:dev`
