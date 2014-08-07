easy-access
==========

Ridiculously easy OAuth2 authentication for command-line scripts and installed apps supporting multiple providers

How to use:

Build / Install:

```bash
npm install -g
```

Get a token (you will be prompted for client id and secret):

```bash
easy_access shutterstock
```


Store and use your token:

```bash
export SSTK_TOKEN=$(easy_access shutterstock)
 curl -H "Authorization: Bearer $SSTK_TOKEN" 'https://api.shutterstock.com/v2/images/search?query=food&fields=page,per_page,total_count,data(id)' | jq .
```
