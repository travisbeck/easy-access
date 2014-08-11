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
  shutterstock: {
    host: 'accounts.shutterstock.com',
    authorize_endpoint: '/oauth/authorize',
    token_endpoint: '/oauth/access_token',
    scope: 'user.view',
  },
  linkedin: {
    host: 'www.linkedin.com',
    authorize_endpoint: '/uas/oauth2/authorization',
    token_endpoint: '/uas/oauth2/accessToken',
    scope: 'r_basicprofile r_network',
  },
};
