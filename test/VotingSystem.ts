import { expect } from "chai";
import { ethers } from "hardhat";
import { VotingSystem, VotingSystemFactory } from "../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("VotingSystem", function () {
  let votingSystem: VotingSystem;
  let votingSystemFactory: VotingSystemFactory;
  let owner: any;
  let voter1: any;
  let voter2: any;
  let electionCreator: any;

  beforeEach(async function () {
    // Get signers from Hardhat
    [owner, voter1, voter2, electionCreator] = await ethers.getSigners();

    // Deploy the VotingSystemFactory
    const VotingSystemFactory = await ethers.getContractFactory(
      "VotingSystemFactory"
    );
    votingSystemFactory = await VotingSystemFactory.deploy();

    // Create a VotingSystem through the factory
    const tx = await votingSystemFactory.createVotingSystem();
    const receipt = await tx.wait();

    // Get the VotingSystem address from the event logs
    const createdEvent = receipt?.logs?.find(
      (log: any) => log.fragment && log.fragment.name === "VotingSystemCreated"
    );

    if (createdEvent) {
      const votingSystemAddress = createdEvent.args[0];

      // Connect to the deployed VotingSystem
      const VotingSystem = await ethers.getContractFactory("VotingSystem");
      votingSystem = VotingSystem.attach(votingSystemAddress);
    } else {
      throw new Error("VotingSystem creation event not found in logs");
    }
  });

  describe("Election Management", function () {
    it("Should allow creating an election", async function () {
      const currentTimestamp = await time.latest();
      const startTime = currentTimestamp + 100;
      const endTime = startTime + 1000;

      await expect(
        votingSystem.createElection(
          "Test Election",
          "This is a test election",
          startTime,
          endTime
        )
      ).to.emit(votingSystem, "ElectionCreated");

      const electionCount = await votingSystem.getElectionCount();
      expect(electionCount).to.equal(1);

      const election = await votingSystem.getElection(1);
      expect(election.title).to.equal("Test Election");
      expect(election.description).to.equal("This is a test election");
      expect(election.startTime).to.equal(startTime);
      expect(election.endTime).to.equal(endTime);
      expect(election.finalized).to.be.false;
      expect(election.totalVotes).to.equal(0);
      expect(election.creator).to.equal(owner.address);
    });

    it("Should allow adding candidates", async function () {
      const currentTimestamp = await time.latest();
      const startTime = currentTimestamp + 100;
      const endTime = startTime + 1000;

      // Create an election
      await votingSystem.createElection(
        "Test Election",
        "This is a test election",
        startTime,
        endTime
      );

      // Add candidates
      await expect(
        votingSystem.addCandidate(1, "Candidate 1", "ipfs://metadata1")
      )
        .to.emit(votingSystem, "CandidateAdded")
        .withArgs(1, 1, "Candidate 1");

      await votingSystem.addCandidate(1, "Candidate 2", "ipfs://metadata2");

      // Get candidate information
      const candidate1 = await votingSystem.getCandidate(1, 1);
      expect(candidate1.id).to.equal(1);
      expect(candidate1.name).to.equal("Candidate 1");
      expect(candidate1.metadata).to.equal("ipfs://metadata1");
      expect(candidate1.voteCount).to.equal(0);

      const candidate2 = await votingSystem.getCandidate(1, 2);
      expect(candidate2.id).to.equal(2);
      expect(candidate2.name).to.equal("Candidate 2");

      // Get all candidate IDs
      const candidateIds = await votingSystem.getCandidateIds(1);
      expect(candidateIds.length).to.equal(2);
      expect(candidateIds[0]).to.equal(1);
      expect(candidateIds[1]).to.equal(2);
    });

    it("Should not allow adding candidates after election starts", async function () {
      const currentTimestamp = await time.latest();
      const startTime = currentTimestamp + 100;
      const endTime = startTime + 1000;

      // Create an election
      await votingSystem.createElection(
        "Test Election",
        "This is a test election",
        startTime,
        endTime
      );

      // Add a candidate
      await votingSystem.addCandidate(1, "Candidate 1", "ipfs://metadata1");

      // Move time forward to after election start
      await time.increaseTo(startTime + 1);

      // Attempt to add another candidate (should fail)
      await expect(
        votingSystem.addCandidate(1, "Candidate 2", "ipfs://metadata2")
      ).to.be.revertedWith("Cannot add candidates after election has started");
    });
  });

  describe("Voting", function () {
    beforeEach(async function () {
      const currentTimestamp = await time.latest();
      const startTime = currentTimestamp + 100;
      const endTime = startTime + 1000;

      // Create an election
      await votingSystem
        .connect(electionCreator)
        .createElection(
          "Test Election",
          "This is a test election",
          startTime,
          endTime
        );

      // Add candidates
      await votingSystem
        .connect(electionCreator)
        .addCandidate(1, "Candidate 1", "ipfs://metadata1");
      await votingSystem
        .connect(electionCreator)
        .addCandidate(1, "Candidate 2", "ipfs://metadata2");

      // Move time to the voting period
      await time.increaseTo(startTime + 10);
    });

    it("Should allow casting votes", async function () {
      await expect(votingSystem.connect(voter1).castVote(1, 1))
        .to.emit(votingSystem, "VoteCast")
        .withArgs(1, 1, voter1.address);

      // Check vote was recorded
      const hasVoted = await votingSystem.hasVoted(1, voter1.address);
      expect(hasVoted).to.be.true;

      // Check vote count increased
      const candidate = await votingSystem.getCandidate(1, 1);
      expect(candidate.voteCount).to.equal(1);

      // Check election total votes
      const election = await votingSystem.getElection(1);
      expect(election.totalVotes).to.equal(1);
    });

    it("Should not allow voting twice", async function () {
      await votingSystem.connect(voter1).castVote(1, 1);

      await expect(
        votingSystem.connect(voter1).castVote(1, 2)
      ).to.be.revertedWith("Voter has already cast a vote");
    });

    it("Should not allow voting after election ends", async function () {
      const election = await votingSystem.getElection(1);

      // Move time to after the election
      await time.increaseTo(election.endTime + 1);

      await expect(
        votingSystem.connect(voter1).castVote(1, 1)
      ).to.be.revertedWith("Election has ended");
    });
  });

  describe("Finalization", function () {
    beforeEach(async function () {
      const currentTimestamp = await time.latest();
      const startTime = currentTimestamp + 100;
      const endTime = startTime + 1000;

      // Create an election
      await votingSystem
        .connect(electionCreator)
        .createElection(
          "Test Election",
          "This is a test election",
          startTime,
          endTime
        );

      // Add candidates
      await votingSystem
        .connect(electionCreator)
        .addCandidate(1, "Candidate 1", "ipfs://metadata1");
      await votingSystem
        .connect(electionCreator)
        .addCandidate(1, "Candidate 2", "ipfs://metadata2");

      // Move time to the voting period
      await time.increaseTo(startTime + 10);

      // Cast votes
      await votingSystem.connect(voter1).castVote(1, 1);
      await votingSystem.connect(voter2).castVote(1, 2);

      // Move time to after the election
      const election = await votingSystem.getElection(1);
      await time.increaseTo(election.endTime + 1);
    });

    it("Should allow the creator to finalize the election", async function () {
      await expect(votingSystem.connect(electionCreator).finalizeElection(1))
        .to.emit(votingSystem, "ElectionFinalized")
        .withArgs(1, 2);

      const election = await votingSystem.getElection(1);
      expect(election.finalized).to.be.true;
    });

    it("Should not allow voting after finalization", async function () {
      // Finalize the election
      await votingSystem.connect(electionCreator).finalizeElection(1);

      // Move time back (just for the test case)
      const election = await votingSystem.getElection(1);
      await time.increaseTo(election.endTime - 100);

      await expect(
        votingSystem.connect(voter1).castVote(1, 2)
      ).to.be.revertedWith("Election has been finalized");
    });

    it("Should not allow non-creators to finalize the election", async function () {
      await expect(
        votingSystem.connect(voter1).finalizeElection(1)
      ).to.be.revertedWith(
        "Only election creator or contract owner can finalize"
      );
    });
  });

  describe("Factory Integration", function () {
    it("Should register elections with the factory", async function () {
      // Create a new voting system through the factory
      const tx = await votingSystemFactory.createVotingSystem();
      const receipt = await tx.wait();

      const createdEvent = receipt?.logs?.find(
        (log: any) =>
          log.fragment && log.fragment.name === "VotingSystemCreated"
      );

      if (createdEvent) {
        const votingSystemAddress = createdEvent.args[0];

        // Register an election with the factory
        const electionId = ethers.id("election-1");
        await votingSystemFactory.registerElection(
          electionId,
          votingSystemAddress
        );

        // Check if the election was registered
        const registeredAddress =
          await votingSystemFactory.getVotingSystemForElection(electionId);
        expect(registeredAddress).to.equal(votingSystemAddress);
      } else {
        throw new Error("VotingSystem creation event not found in logs");
      }
    });
  });
});
