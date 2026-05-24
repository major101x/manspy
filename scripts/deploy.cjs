const hre = require('hardhat');

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log('Deploying with account:', deployer.address);

  const ManSpyAlertLog = await hre.ethers.getContractFactory('ManSpyAlertLog');
  const contract = await ManSpyAlertLog.deploy();

  await contract.waitForDeployment();

  console.log('ManSpyAlertLog deployed to:', await contract.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});