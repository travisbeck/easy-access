#! /usr/bin/env node
'use strict';
var http         = require('http');
var url          = require('url');
var querystring  = require('querystring');
var open_command = require('open');
var request      = require('request');
var fs           = require('fs');
var prompt       = require('prompt');
var lodash       = require('lodash');
var providers    = require('./providers');
var opt_parser   = require('nomnom');

// TODO: incremental scope authorization
// TODO: write tests
// TODO: better error handling
// TODO: search home directory for config file
// TODO: integrate with more identity providers

var EasyAccess = function(provider, original_options) {
  var options = original_options || {};
  if (provider && providers[provider]) options = lodash.merge(providers[provider], options);
  var provider_name = original_options && original_options.host ? options.host : provider;
  this.host          = options.host;
  this.port          = options.port || 3003;
  this.client_id     = options.client_id;
  this.client_secret = options.client_secret;
  this.client_grant  = options.client_grant || false;
  this.file          = options.file || '.easy-access-' + provider_name + '.json';
  this.debug         = options.debug || false;
  this.reauthorize   = options.reauthorize || false;
  this.scope         = options.scope;
  this.authorize_endpoint = options.authorize_endpoint;
  this.token_endpoint = options.token_endpoint;

  var missing_required = [];
  if (!this.host)               missing_required.push('host');
  if (!this.authorize_endpoint) missing_required.push('authorize_endpoint');
  if (!this.token_endpoint)     missing_required.push('token_endpoint');

  if (missing_required.length > 0) {
    var message = '';
    missing_required.forEach(function(arg) { message = message + arg + ' is required' + '\n' });
    throw message;
  }
  return this;
};

EasyAccess.prototype.load = function(callback) {
  var self = this;
  fs.readFile(self.file, function(err, data) {
    if (data) {
      var config = JSON.parse(data.toString());
      self.client_id = config.client_id;
      self.client_secret = config.client_secret;
      callback(config);
    } else {
      callback({});
    }
  });
};

EasyAccess.prototype.get_access_token = function(callback) {
  var self = this;
  self.load(function(file_data) {
    if (self.client_grant) {
      self.request_client_token(callback);
    } else if (!self.reauthorize && file_data.access_token && file_data.expiration &&
      file_data.expiration > Date.now() + 60 * 5 * 1000
    ) {
      if (self.debug) console.error('Unexpired access token loaded from file');
      callback(file_data);
    } else if (!self.reauthorize && file_data.access_token && file_data.expiration === null) {
      // take an existing expiration with a null value to mean 'no expiration'
      if (self.debug) console.error('Access token w/no expiration loaded from file');
      callback(file_data);
    } else if (!self.reauthorize && file_data.refresh_token) {
      console.error('Using refresh token to acquire new access token...');
      self.refresh_access_token(file_data.refresh_token, callback);
    } else {
      self.authorize_manually(callback);
    }
  });
};

EasyAccess.prototype.authorize_manually = function(callback) {
  var self = this;
  if (!Boolean(process.stdin.isTTY) || !Boolean(process.stdout.isTTY)) {
    console.error('Not connected to an interactive terminal. ');
    console.error('Can\'t request manual authorization through the browser. Unable to continue.');
    return callback();
  }

  if (!self.client_id) {
    console.log('Authenticating manually against ' + self.host);
    console.log('If you don\'t have a client_id and client_secret, please visit the site and get one');
    console.log('Verify that your callback url points to \'http://localhost:' + self.port + '/\'');
  }

  prompt.override = self;
  prompt.message = '';
  prompt.delimiter = '';
  prompt.start();
  prompt.get([
    { name: 'client_id', description: 'Enter your client id:' },
    { name: 'client_secret', description: 'Enter your client secret:' }
  ], function(err, result) {
    if (!self.client_id || !self.client_secret) {
      self.client_id = result.client_id;
      self.client_secret = result.client_secret;
      var client_data = { client_id: self.client_id, client_secret: self.client_secret };
      fs.writeFile(self.file, JSON.stringify(client_data, undefined, 2), function() {
        console.error('Token data written to: ' + self.file);
        console.error('Opening browser window to login manually...');
        self.request_authorization(callback);
      });
    } else {
      console.error('Opening browser window to login manually...');
      self.request_authorization(callback);
    }
  });
};

EasyAccess.prototype.request_authorization = function(callback) {
  var self = this;
  var authorize_url = url.format({
    protocol: 'https',
    host: self.host,
    pathname: self.authorize_endpoint,
    query: {
      client_id:     self.client_id,
      redirect_uri:  'http://localhost:' + self.port + '/',
      scope:         self.scope,
      response_type: 'code',
    }
  });

  EasyAccess.single_use_web_server(self.port, authorize_url, function(params) {
    if (params.pathname === '/' && params.query.code) {
      self.request_access_token({
        client_id: self.client_id,
        client_secret: self.client_secret,
        grant_type: 'authorization_code',
        code: params.query.code,
        redirect_uri:  'http://localhost:' + self.port + '/',
      }, function(err, token_data) {
        callback(token_data);
      });
    } else {
      console.error('Unknown request:');
      console.error(params);
      callback();
    }
  });
};

// spin up a disposable web server for redirecting a browser back into
EasyAccess.single_use_web_server = function(port, browser_url, callback) {
  var sockets = [];
  var server = http.createServer(function(req, res) {
    var params = url.parse(req.url, true);
    callback(params);
    res.on('finish', function() {
      // close opened sockets and the server when the request is done
      sockets.forEach(function(socket) { socket.destroy() });
      server.close(function() { console.error('Server stopped') });
    });
    res.writeHead(200, { 'Content-Type': 'text/html' });
    var html = '<html><head><script>setTimeout(function(){window.open(\'\',\'_self\',\'\');window.close()},10)';
    html += '</script></head><body>You may close this window.</body></html>';
    res.end(html);
  }).listen(port);
  server.on('connection', function(socket) { sockets.push(socket) });
  console.error('Server running at http://localhost:' + port + '/');

  open_command(browser_url);
};

EasyAccess.prototype.request_client_token = function(callback) {
  var self = this;
  console.error('Getting access token for client');
  self.request_access_token({
    client_id: self.client_id,
    client_secret: self.client_secret,
    grant_type: 'client_credentials',
  }, function(err, token_data) {
    callback(token_data);
  });
};

EasyAccess.prototype.refresh_access_token = function(refresh_token, callback) {
  var self = this;
  self.request_access_token({
    client_id: self.client_id,
    client_secret: self.client_secret,
    grant_type: 'refresh_token',
    refresh_token: refresh_token,
  }, function(err, token_data) {
    if (token_data) {
      callback(token_data);
    } else {
      console.error('Refresh token failed: ' + err);
      self.authorize_manually(callback);
    }
  });
};

EasyAccess.prototype.request_access_token = function(form_data, callback) {
  var self = this;
  request.post('https://' + self.host + self.token_endpoint, {
      form: form_data,
      headers: {
        Accept: 'application/json,application/x-www-form-urlencoded'
      }
    }, function(error, response, body) {
    if (error) {
      console.error(error);
      return callback(error);
    } else if (response.statusCode === 200) {
      var token_data = {};
      if (response.headers['content-type'].match('^application/json')) {
        token_data = JSON.parse(body);
      } else if (response.headers['content-type'].match('^application/x-www-form-urlencoded')) {
        token_data = querystring.parse(body);
      }
      if (token_data.expires_in) {
        token_data.expiration = Date.now() + token_data.expires_in * 1000;
      } else {
        token_data.expiration = null;
      }
      token_data.client_id = form_data.client_id;
      token_data.client_secret = form_data.client_secret;
      delete token_data.expires_in;

      fs.writeFile(self.file, JSON.stringify(token_data, undefined, 2), function() {
        console.error('Token data written to: ' + self.file);
        callback(null, token_data);
      });
    } else {
      if (self.debug) {
        console.error('Unexpected response getting access token');
        console.error('REQUEST:\n\n' + response.request.method + ' ' + response.request.uri.href);
        Object.keys(response.request.headers).forEach(function(key) {
          console.error(key + ': ' + response.request.headers[key]);
        });
        console.error('\n' + response.request.body + '\n');
        console.error('RESPONSE:\n\nHTTP/' + response.httpVersion + ' ' + response.statusCode);
        Object.keys(response.headers).forEach(function(key) {
          console.error(key + ': ' + response.headers[key]);
        });
        console.error('\n' + body + '\n');
      }
      return callback(body);
    }
  });
};

module.exports = EasyAccess;

if (require.main === module) {
  opt_parser.script('easy_access');
  opt_parser.help('easy_access is a utility for acquiring access tokens for a number of OAuth2 identity providers');
  opt_parser.options({
    provider: {
      position: 0,
      help: 'Remote OAuth2 identity provider to get access token for',
      choices: Object.keys(providers),
    },
    host: {
      help: 'Remote host',
    },
    client_id: {
      help: 'Client ID',
      full: 'id',
    },
    client_secret: {
      help: 'Client Secret',
      full: 'secret',
    },
    scope: {
      abbr: 's',
      help: 'Scope to request authorization for\n' +
        '                          Note: This is VERY application specific\n' +
        '                          See your provider\'s api documentation for more info',
    },
    authorize_endpoint: {
      help: 'Endpoint for authorizing users. (Usually something like /oauth/authorize)',
      full: 'authorize-endpoint',
    },
    token_endpoint: {
      help: 'Endpoint for acquiring access tokens. (Usually something like /oauth/access_token)',
      full: 'token-endpoint',
    },
    file: {
      abbr: 'f',
      help: 'File to load access credentials from',
    },
    debug: {
      abbr: 'd',
      flag: true,
      help: 'Print debugging information',
    },
    reauthorize: {
      abbr: 'r',
      flag: true,
      help: 'Ignore cached access and refresh tokens and reauthorize manually',
    },
    client_grant: {
      abbr: 'c',
      help: 'Use a client_credentials grant (contains no user information, not supported by all identity providers)',
      full: 'client-grant',
    },
    port: {
      help: 'Local port to run websever (for OAuth2 callbacks). Defaults to: 3003',
    },
  });
  var opts = opt_parser.parse();

  try {
    var easy_access = new EasyAccess(opts.provider, opts);
  } catch (e) {
    console.error(e);
    console.error(opt_parser.getUsage());
    process.exit(1);
  }
  easy_access.get_access_token(function(token_data) {
    if (token_data && token_data.access_token) console.log(token_data.access_token);
  });
}
