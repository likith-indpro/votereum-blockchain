// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./VotingSystem.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title VotingSystemFactory
 * @dev Factory contract to create and manage multiple VotingSystem instances
 */
contract VotingSystemFactory is Ownable {
    // Array to keep track of all created voting systems
    address[] public votingSystems;
    
    // Mapping from election ID to voting system address
    mapping(bytes32 => address) public electionToSystem;
    
    // Mapping to track if an address is a voting system created by this factory
    mapping(address => bool) public isVotingSystem;
    
    // Events
    event VotingSystemCreated(address indexed votingSystemAddress, address indexed creator);
    event ElectionRegistered(bytes32 indexed electionId, address indexed votingSystem);
    
    // Constructor
    constructor() Ownable(msg.sender) {}
    
    /**
     * @dev Create a new voting system
     */
    function createVotingSystem() public returns (address) {
        VotingSystem newVotingSystem = new VotingSystem();
        
        // Transfer ownership of the voting system to the creator
        newVotingSystem.transferOwnership(msg.sender);
        
        // Register the new voting system
        address votingSystemAddress = address(newVotingSystem);
        votingSystems.push(votingSystemAddress);
        isVotingSystem[votingSystemAddress] = true;
        
        emit VotingSystemCreated(votingSystemAddress, msg.sender);
        
        return votingSystemAddress;
    }
    
    /**
     * @dev Register an election with a specific ID
     */
    function registerElection(bytes32 electionId, address votingSystem) public {
        require(isVotingSystem[votingSystem], "Not a valid voting system");
        require(electionToSystem[electionId] == address(0), "Election ID already registered");
        
        // Only the voting system owner can register an election
        VotingSystem vs = VotingSystem(votingSystem);
        require(vs.owner() == msg.sender, "Not the owner of this voting system");
        
        electionToSystem[electionId] = votingSystem;
        emit ElectionRegistered(electionId, votingSystem);
    }
    
    /**
     * @dev Get all voting systems
     */
    function getAllVotingSystems() public view returns (address[] memory) {
        return votingSystems;
    }
    
    /**
     * @dev Get voting system for a specific election
     */
    function getVotingSystemForElection(bytes32 electionId) public view returns (address) {
        return electionToSystem[electionId];
    }
    
    /**
     * @dev Get total number of voting systems
     */
    function getVotingSystemCount() public view returns (uint256) {
        return votingSystems.length;
    }
}