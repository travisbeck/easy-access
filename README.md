api-client
==========

How to use:

Build:

 rock build

Get a token:

 export SSTK_TOKEN=$(rock run node auth.js)

Use your token:

 curl -H "Authorization: Bearer $SSTK_TOKEN" 'https://api.shutterstock.com/v2/images/search?query=food&fields=page,per_page,total_count,data(id)' | jq .
