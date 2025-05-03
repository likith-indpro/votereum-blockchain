import { ethers } from "hardhat";

async function main() {
  console.log("Deploying Votereum blockchain voting system...");

  // Deploy the VotingSystemFactory contract
  const VotingSystemFactory = await ethers.getContractFactory(
    "VotingSystemFactory"
  );
  const votingSystemFactory = await VotingSystemFactory.deploy();
  await votingSystemFactory.waitForDeployment();

  const votingSystemFactoryAddress = await votingSystemFactory.getAddress();
  console.log(`VotingSystemFactory deployed to: ${votingSystemFactoryAddress}`);

  // Create a VotingSystem through the factory
  const createTx = await votingSystemFactory.createVotingSystem();
  const receipt = await createTx.wait();

  // Get the created VotingSystem address from the event logs
  const createdEvent = receipt?.logs?.find(
    (log: any) => log.fragment && log.fragment.name === "VotingSystemCreated"
  );

  if (createdEvent) {
    const votingSystemAddress = createdEvent.args[0];
    console.log(`Created VotingSystem at: ${votingSystemAddress}`);

    // Connect to the deployed VotingSystem
    const VotingSystem = await ethers.getContractFactory("VotingSystem");
    const votingSystem = VotingSystem.attach(votingSystemAddress);

    // Log some information from the deployed contract
    const electionCount = await votingSystem.getElectionCount();
    console.log(`Initial election count: ${electionCount}`);
  } else {
    console.log("VotingSystem creation event not found in logs");
  }

  console.log("Deployment complete!");
}

// Handle errors
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
