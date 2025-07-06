#!/bin/bash

# Замените на ваши реальные значения
ADDRESS="TPZJzAogU7kA6DAozL5mqnDRwZkPsGQcuH"
CONTRACT="TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcd3"
API_KEY="b221365a-5a86-4d75-a1a3-1456c7f1864d"

# Конвертация адреса в HEX
HEX_ADDRESS=$(node -e "console.log(require('tronweb').address.toHex('$ADDRESS'))")
HEX_CONTRACT=$(node -e "console.log(require('tronweb').address.toHex('$CONTRACT'))")

echo "Address: $ADDRESS"
echo "HEX Address: $HEX_ADDRESS"
echo "Contract: $CONTRACT"
echo "HEX Contract: $HEX_CONTRACT"

# Формирование параметра (удаляем префикс 41)
PARAMETER=${HEX_ADDRESS:2}
PARAMETER=$(printf "%064s" $PARAMETER | tr ' ' '0')

echo "Parameter: $PARAMETER"

# Вызов API
curl -X POST \
  -H "TRON-PRO-API-KEY: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "owner_address": "'$HEX_ADDRESS'",
    "contract_address": "'$HEX_CONTRACT'",
    "function_selector": "balanceOf(address)",
    "parameter": "'$PARAMETER'",
    "visible": true
  }' \
  "https://api.shasta.trongrid.io/wallet/triggerconstantcontract"