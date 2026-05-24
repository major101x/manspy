// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ManSpyAlertLog {
    struct AlertRecord {
        string txHash;
        string pattern;
        string riskLevel;
        uint256 confidence;
        uint256 timestamp;
    }
    
    AlertRecord[] public records;
    
    event AlertLogged(
        uint256 indexed id,
        string txHash,
        string pattern,
        string riskLevel,
        uint256 confidence,
        uint256 timestamp
    );
    
    function logAlert(
        string memory txHash,
        string memory pattern,
        string memory riskLevel,
        uint256 confidence
    ) public returns (uint256) {
        uint256 id = records.length;
        records.push(AlertRecord({
            txHash: txHash,
            pattern: pattern,
            riskLevel: riskLevel,
            confidence: confidence,
            timestamp: block.timestamp
        }));
        
        emit AlertLogged(id, txHash, pattern, riskLevel, confidence, block.timestamp);
        return id;
    }
    
    function getRecord(uint256 id) public view returns (AlertRecord memory) {
        require(id < records.length, "Invalid ID");
        return records[id];
    }
    
    function getRecordCount() public view returns (uint256) {
        return records.length;
    }
}