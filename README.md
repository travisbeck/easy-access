easy-access
==========

Ridiculously easy OAuth2 authentication for command-line scripts and installed apps supporting multiple providers

## Setup:

##### Build / Install:

```bash
npm install -g easy-access
```

##### First get access to the remote API

This usually involves signing up for api access. You will be given a client ID
and secret. Make sure to set your Callback url (sometimes called Redirect url)
to http://localhost:3003/. You might need to drop the port depending on the
provider.


##### Get a token manually (the first time):

```bash
easy_access google
```

You will be prompted for client id and secret and a browser window will open so
you can authorize the access. Once you have authorized, the browser window
should close and your access token will be printed to STDOUT and a
.easy-access-google.json file will be created.

You must do this manually from the command line the first time from the command
line. Once completed, your credentials will be cached in a local file
named .easy-access-<provider_name>.json.


## How to use

##### Use your stored credentials in a script:

```bash
TOKEN=$(easy_access google)
curl -H "Authorization: Bearer $TOKEN" 'https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=owner'
```

This will either use your access token or refresh token depending on expiration
and the provider, but you should not need to do anything manually and you can
safely put this in a script or cron entry.

##### Use your stored credentials within node:

```node
var EasyAccess = require(‘easy-access');
var easy_access = new EasyAccess('google');
easy_access.get_access_token(function(token_data) {
  if (token_data && token_data.access_token) console.log(token_data.access_token);
});
```
