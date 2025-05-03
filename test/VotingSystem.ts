import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("VotingSystem", function () {
  let votingSystem: any;
  let votingSystemFactory: any;
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
    const votingSystemAddress = await extractVotingSystemAddress(receipt);

    // Connect to the deployed VotingSystem
    const VotingSystem = await ethers.getContractFactory("VotingSystem");
    votingSystem = VotingSystem.attach(votingSystemAddress);
  });

  // Helper function to extract voting system address from event logs
  async function extractVotingSystemAddress(receipt: any): Promise<string> {
    for (const event of receipt.logs) {
      try {
        const parsed = votingSystemFactory.interface.parseLog({
          topics: event.topics,
          data: event.data,
        });
        if (parsed && parsed.name === "VotingSystemCreated") {
          return parsed.args[0];
        }
      } catch (e) {
        // Not a matching event, skip
      }
    }
    throw new Error("VotingSystem creation event not found in logs");
  }

  describe("Election Management", function () {
    it("Should allow creating an election", async function () {
      const currentTimestamp = BigInt(await time.latest());
      const startTime = currentTimestamp + 100n;
      const endTime = startTime + 1000n;

      await expect(
        votingSystem.createElection(
          "Test Election",
          "This is a test election",
          startTime,
          endTime
        )
      ).to.emit(votingSystem, "ElectionCreated");

      const electionCount = await votingSystem.getElectionCount();
      expect(electionCount).to.equal(1n);

      const election = await votingSystem.getElection(1);
      expect(election.title).to.equal("Test Election");
      expect(election.description).to.equal("This is a test election");
      expect(election.startTime).to.equal(startTime);
      expect(election.endTime).to.equal(endTime);
      expect(election.finalized).to.be.false;
      expect(election.totalVotes).to.equal(0n);
      expect(election.creator).to.equal(owner.address);
    });

    it("Should allow adding candidates", async function () {
      const currentTimestamp = BigInt(await time.latest());
      const startTime = currentTimestamp + 100n;
      const endTime = startTime + 1000n;

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
        .withArgs(1, 1n, "Candidate 1");

      await votingSystem.addCandidate(1, "Candidate 2", "ipfs://metadata2");

      // Get candidate information
      const candidate1 = await votingSystem.getCandidate(1, 1);
      expect(candidate1.id).to.equal(1n);
      expect(candidate1.name).to.equal("Candidate 1");
      expect(candidate1.metadata).to.equal("ipfs://metadata1");
      expect(candidate1.voteCount).to.equal(0n);

      const candidate2 = await votingSystem.getCandidate(1, 2);
      expect(candidate2.id).to.equal(2n);
      expect(candidate2.name).to.equal("Candidate 2");

      // Get all candidate IDs
      const candidateIds = await votingSystem.getCandidateIds(1);
      expect(candidateIds.length).to.equal(2);
      expect(candidateIds[0]).to.equal(1n);
      expect(candidateIds[1]).to.equal(2n);
    });

    it("Should not allow adding candidates after election starts", async function () {
      const currentTimestamp = BigInt(await time.latest());
      const startTime = currentTimestamp + 100n;
      const endTime = startTime + 1000n;

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
      await time.increaseTo(startTime + 1n);

      // Attempt to add another candidate (should fail)
      await expect(
        votingSystem.addCandidate(1, "Candidate 2", "ipfs://metadata2")
      ).to.be.revertedWith("Cannot add candidates after election has started");
    });
  });

  describe("Voting", function () {
    beforeEach(async function () {
      const currentTimestamp = BigInt(await time.latest());
      const startTime = currentTimestamp + 100n;
      const endTime = startTime + 1000n;

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
      await time.increaseTo(startTime + 10n);
    });

    it("Should allow casting votes", async function () {
      await expect(votingSystem.connect(voter1).castVote(1, 1))
        .to.emit(votingSystem, "VoteCast")
        .withArgs(1, 1n, voter1.address);

      // Check vote was recorded
      const hasVoted = await votingSystem.hasVoted(1, voter1.address);
      expect(hasVoted).to.be.true;

      // Check vote count increased
      const candidate = await votingSystem.getCandidate(1, 1);
      expect(candidate.voteCount).to.equal(1n);

      // Check election total votes
      const election = await votingSystem.getElection(1);
      expect(election.totalVotes).to.equal(1n);
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
      await time.increaseTo(BigInt(election.endTime) + 1n);

      await expect(
        votingSystem.connect(voter1).castVote(1, 1)
      ).to.be.revertedWith("Election has ended");
    });
  });

  describe("Finalization", function () {
    beforeEach(async function () {
      const currentTimestamp = BigInt(await time.latest());
      const startTime = currentTimestamp + 100n;
      const endTime = startTime + 1000n;

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
      await time.increaseTo(startTime + 10n);

      // Cast votes
      await votingSystem.connect(voter1).castVote(1, 1);
      await votingSystem.connect(voter2).castVote(1, 2);

      // Move time to after the election
      const election = await votingSystem.getElection(1);
      await time.increaseTo(BigInt(election.endTime) + 1n);
    });

    it("Should allow the creator to finalize the election", async function () {
      await expect(votingSystem.connect(electionCreator).finalizeElection(1))
        .to.emit(votingSystem, "ElectionFinalized")
        .withArgs(1, 2n);

      const election = await votingSystem.getElection(1);
      expect(election.finalized).to.be.true;
    });

    it("Should not allow voting after finalization", async function () {
      // Finalize the election
      await votingSystem.connect(electionCreator).finalizeElection(1);

      // Try to vote after finalization
      // The contract first checks if the election has ended before checking if it's finalized
      await expect(
        votingSystem.connect(voter1).castVote(1, 2)
      ).to.be.revertedWith("Election has ended");
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

      const votingSystemAddress = await extractVotingSystemAddress(receipt);

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
    });
  });
});
