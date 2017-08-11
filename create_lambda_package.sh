#!/bin/bash

rm deploy.zip
zip -r deploy.zip .

# aws lambda update-function-code --region eu-central-1 --function-name HashCalc --zip-file fileb://deploy.zip
