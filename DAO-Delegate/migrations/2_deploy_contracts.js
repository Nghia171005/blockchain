const DAO = artifacts.require("DAO");

module.exports = async function (deployer, network, accounts) {
  // accounts[0] deploy -> trở thành Owner và thành viên đầu tiên (xem constructor).
  await deployer.deploy(DAO);
  const dao = await DAO.deployed();

  // Thêm sẵn 3 thành viên trên mạng local để demo cho nhanh.
  if (network === "development") {
    for (const acc of accounts.slice(1, 4)) {
      await dao.addMember(acc);
    }
  }
  console.log("DAO deployed at:", dao.address);
};
