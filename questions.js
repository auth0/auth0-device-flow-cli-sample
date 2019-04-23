require('dotenv').config();

const { AUTH0_CLIENT_ID, AUTH0_DOMAIN } = process.env;

const questions = [
  {
    type: 'text',
    name: 'domain',
    message: 'What is your Auth0 domain?',
    initial: AUTH0_DOMAIN,
  },
  {
    type: 'text',
    name: 'client_id',
    message: 'What is your Device Flow Client ID?',
    initial: AUTH0_CLIENT_ID,
  },
  {
    type: 'text',
    name: 'audience',
    message: 'What is the target Access Token API Audience?',
  },
  {
    type: 'multiselect',
    name: 'scope',
    message: 'What are the target Access Token scopes?',
    choices: [
      { value: 'address' },
      { value: 'email' },
      { value: 'offline_access' },
      { value: 'phone' },
      { value: 'profile', selected: true },
      { value: 'openid', selected: true },
    ],
  }
];

module.exports = questions;
