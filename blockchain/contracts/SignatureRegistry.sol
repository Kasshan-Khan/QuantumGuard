// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract SignatureRegistry is Ownable {
    event SignatureRecorded(
        string indexed docHash,
        string threatScore,
        uint256 timestamp,
        address indexed recorder
    );

    constructor() Ownable(msg.sender) {}

    function recordSignature(string memory _docHash, string memory _threatScore) external onlyOwner {
        emit SignatureRecorded(_docHash, _threatScore, block.timestamp, msg.sender);
    }
}
