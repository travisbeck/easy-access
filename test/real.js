'use strict';

var fs = require('fs');
var EasyAccess = require('..');

var test_credentials_for_provider = function(provider) {
  return function() {
    if (fs.existsSync('.easy-access-' + provider + '.json')) {
      it('should get a real access token', function(done) {
        var easy_access = new EasyAccess(provider, {});
        easy_access.get_access_token(function(token_data) {
          if (token_data && token_data.access_token) done();
        });
      });
    }
  };
};

describe('real google credentials', test_credentials_for_provider('google'));
describe('real github credentials', test_credentials_for_provider('github'));
describe('real dropbox credentials', test_credentials_for_provider('dropbox'));
describe('real shutterstock credentials', test_credentials_for_provider('shutterstock'));
