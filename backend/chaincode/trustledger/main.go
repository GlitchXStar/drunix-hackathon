package main

import (
	"log"

	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
)

func main() {
	cc, err := contractapi.NewChaincode(&SmartContract{})
	if err != nil {
		log.Panicf("Error creating trustledger chaincode: %v", err)
	}

	if err := cc.Start(); err != nil {
		log.Panicf("Error starting trustledger chaincode: %v", err)
	}
}
