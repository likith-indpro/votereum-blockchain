// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title VotingSystem
 * @dev A secure blockchain-based voting system
 */
contract VotingSystem is Ownable, ReentrancyGuard {
    // Counter for election IDs - replacing Counters.sol with a simple uint256
    uint256 private _electionIdCounter;

    struct Candidate {
        uint256 id;
        string name;
        string metadata; // IPFS hash or other metadata reference
        uint256 voteCount;
    }

    struct Election {
        uint256 id;
        string title;
        string description;
        uint256 startTime;
        uint256 endTime;
        bool finalized;
        mapping(uint256 => Candidate) candidates;
        uint256[] candidateIds;
        mapping(address => bool) hasVoted;
        uint256 totalVotes;
        address creator;
    }

    // Mapping of election ID to Election struct
    mapping(uint256 => Election) private _elections;

    // Events
    event ElectionCreated(uint256 indexed electionId, string title, uint256 startTime, uint256 endTime, address creator);
    event CandidateAdded(uint256 indexed electionId, uint256 indexed candidateId, string name);
    event VoteCast(uint256 indexed electionId, uint256 indexed candidateId, address indexed voter);
    event ElectionFinalized(uint256 indexed electionId, uint256 totalVotes);

    // Constructor
    constructor() Ownable(msg.sender) {}

    /**
     * @dev Create a new election
     */
    function createElection(
        string memory title,
        string memory description,
        uint256 startTime,
        uint256 endTime
    ) public returns (uint256) {
        require(startTime >= block.timestamp, "Start time must be in the future");
        require(endTime > startTime, "End time must be after start time");

        // Increment the election ID counter
        _electionIdCounter++;
        uint256 newElectionId = _electionIdCounter;

        Election storage election = _elections[newElectionId];
        election.id = newElectionId;
        election.title = title;
        election.description = description;
        election.startTime = startTime;
        election.endTime = endTime;
        election.finalized = false;
        election.creator = msg.sender;

        emit ElectionCreated(newElectionId, title, startTime, endTime, msg.sender);
        return newElectionId;
    }

    /**
     * @dev Add a candidate to an election
     */
    function addCandidate(
        uint256 electionId,
        string memory name,
        string memory metadata
    ) public {
        Election storage election = _elections[electionId];
        
        require(election.id != 0, "Election does not exist");
        require(election.startTime > block.timestamp, "Cannot add candidates after election has started");
        require(msg.sender == election.creator || msg.sender == owner(), "Only election creator or contract owner can add candidates");

        uint256 candidateId = election.candidateIds.length + 1;
        
        Candidate storage newCandidate = election.candidates[candidateId];
        newCandidate.id = candidateId;
        newCandidate.name = name;
        newCandidate.metadata = metadata;
        newCandidate.voteCount = 0;

        election.candidateIds.push(candidateId);

        emit CandidateAdded(electionId, candidateId, name);
    }

    /**
     * @dev Cast a vote in an election
     */
    function castVote(uint256 electionId, uint256 candidateId) public nonReentrant {
        Election storage election = _elections[electionId];
        
        require(election.id != 0, "Election does not exist");
        require(block.timestamp >= election.startTime, "Election has not started yet");
        require(block.timestamp <= election.endTime, "Election has ended");
        require(!election.finalized, "Election has been finalized");
        require(!election.hasVoted[msg.sender], "Voter has already cast a vote");
        require(candidateId > 0 && candidateId <= election.candidateIds.length, "Invalid candidate");

        // Mark voter as having voted
        election.hasVoted[msg.sender] = true;
        
        // Increment vote count for the candidate
        election.candidates[candidateId].voteCount++;
        
        // Increment total votes
        election.totalVotes++;

        emit VoteCast(electionId, candidateId, msg.sender);
    }

    /**
     * @dev Finalize an election, preventing any further votes
     */
    function finalizeElection(uint256 electionId) public {
        Election storage election = _elections[electionId];
        
        require(election.id != 0, "Election does not exist");
        require(block.timestamp > election.endTime, "Election has not ended yet");
        require(!election.finalized, "Election already finalized");
        require(msg.sender == election.creator || msg.sender == owner(), "Only election creator or contract owner can finalize");

        election.finalized = true;

        emit ElectionFinalized(electionId, election.totalVotes);
    }

    /**
     * @dev Check if a voter has already cast a vote
     */
    function hasVoted(uint256 electionId, address voter) public view returns (bool) {
        return _elections[electionId].hasVoted[voter];
    }

    /**
     * @dev Get details of an election
     */
    function getElection(uint256 electionId) public view returns (
        string memory title,
        string memory description,
        uint256 startTime,
        uint256 endTime,
        bool finalized,
        uint256 totalVotes,
        address creator,
        uint256 candidateCount
    ) {
        Election storage election = _elections[electionId];
        require(election.id != 0, "Election does not exist");
        
        return (
            election.title,
            election.description,
            election.startTime,
            election.endTime,
            election.finalized,
            election.totalVotes,
            election.creator,
            election.candidateIds.length
        );
    }

    /**
     * @dev Get candidate details
     */
    function getCandidate(uint256 electionId, uint256 candidateId) public view returns (
        uint256 id,
        string memory name,
        string memory metadata,
        uint256 voteCount
    ) {
        Election storage election = _elections[electionId];
        require(election.id != 0, "Election does not exist");
        require(candidateId > 0 && candidateId <= election.candidateIds.length, "Invalid candidate");
        
        Candidate storage candidate = election.candidates[candidateId];
        
        return (
            candidate.id,
            candidate.name,
            candidate.metadata,
            candidate.voteCount
        );
    }

    /**
     * @dev Get all candidates for an election
     */
    function getCandidateIds(uint256 electionId) public view returns (uint256[] memory) {
        Election storage election = _elections[electionId];
        require(election.id != 0, "Election does not exist");
        
        return election.candidateIds;
    }

    /**
     * @dev Get total number of elections
     */
    function getElectionCount() public view returns (uint256) {
        return _electionIdCounter;
    }
}