module.exports = {
  google: {
    host: 'accounts.google.com',
    authorize_endpoint: '/o/oauth2/auth',
    token_endpoint: '/o/oauth2/token',
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
  },
  github: {
    host: 'github.com',
    authorize_endpoint: '/login/oauth/authorize',
    token_endpoint: '/login/oauth/access_token',
  },
  dropbox: {
    host: 'api.dropbox.com',
    authorize_endpoint: 'https://www.dropbox.com/1/oauth2/authorize',
    token_endpoint: 'https://api.dropbox.com/1/oauth2/token',
  },
  shutterstock_github: {
    host: 'github.shuttercorp.net',
    authorize_endpoint: '/login/oauth/authorize',
    token_endpoint: '/login/oauth/access_token',
  },
  // TODO: do something smarter with scopes here
  shutterstock: {
    host: 'accounts.shutterstock.com',
    authorize_endpoint: '/oauth/authorize',
    token_endpoint: '/oauth/access_token',
    scope: 'user.view user.email user.address user.edit organization.view ' +
      'organization.address collections.view collections.edit licenses.view licenses.create',
  },
};
