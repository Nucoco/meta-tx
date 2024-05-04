const {Web3} = require("web3");

const web3 = new Web3();

// 秘密鍵に対応するアドレス: 0xE3b0DE0E4CA5D3CB29A9341534226C4D31C9838f
const PRI_KEY = "0xd1c71e71b06e248c8dbe94d49ef6d6b0d64f5d71b1e33a0f39e14dadb070304a"
const LIB = {
  web3: 'web3',
  ethers: 'ethers',
}

const deploy = async (name, initial) => {
  const factory = await hre.ethers.getContractFactory(name);
  let contract;
  if (initial === undefined){
    contract = await factory.deploy();
  } else {
    contract = await factory.deploy(initial);
  }
  await contract.waitForDeployment();
  const addr = await contract.getAddress();
  console.log(name, ": ", addr);
  return contract;
}

const makeCalldata = (lib, fragment, params) => {
  let abiEncodedCall;

  if (lib === LIB.web3){
    abiEncodedCall = web3.eth.abi.encodeFunctionCall(fragment, params);
  } else if (lib === LIB.ethers){
    const iface = new hre.ethers.Interface([fragment]);
    abiEncodedCall = iface.encodeFunctionData(fragment.name, params);
    // other ways
    // const iface = memberList.interface;
    // const iface = new hre.ethers.Interface(["function regist(string memory name, uint8 age, bool isMale"]);
  }

	console.log(`calldate: ${abiEncodedCall}`)
  return abiEncodedCall;
}

const hash = (lib, calldata) => {
	if(lib===LIB.web3){
    return web3.utils.soliditySha3(calldata);
  } else if(lib===LIB.ethers){
    return hre.ethers.keccak256(calldata);
  }
}

const sign = async (lib, hash) => {
  let r,s,v,sender;
	if (lib === LIB.web3) {
    const wallet = web3.eth.accounts.privateKeyToAccount(PRI_KEY);
    ({ r, s, v } = web3.eth.accounts.sign(hash, wallet.privateKey));
    sender = wallet.address
  } else if (lib === LIB.ethers) {
		const wallet = new hre.ethers.Wallet(PRI_KEY);
		const sigHash = await wallet.signMessage(hre.ethers.getBytes(hash));
		({ r, s, v } = hre.ethers.Signature.from(sigHash));
    sender = wallet.address;
		// v5 ethers.js
		// https://docs.ethers.org/v6/migrating/
		// const sigHash = await wallet.signMessage(hre.ethers.utils.arrayify(hash))
		// const { r, s , v} = ethers.splitSignature(sigHash);
  }
	console.log(`r: ${r}\ns: ${s}\nv: ${v}`);
  return {r, s, v, sender};
}

const run = async (lib) => {
  const relayer = await deploy("Relayer")
  const memberList = await deploy("MemberList", (await relayer.getAddress()))

  // interface
  const fragment = {
    name: 'regist',
	  type: 'function',
	  inputs: [
      {type: 'string', name: 'name' },
	  	{type: 'uint8', name: 'age' },
	  	{type: 'bool', name: 'isMale' },
	  ]
	};
  // params
  const name = "tom";
  const age = 21;
  const isMale = true;
  const params = [name, age, isMale];

  const calldata = makeCalldata(lib, fragment, params)
  const hashedCalldata = hash(lib, calldata)
  const { r, s, v, sender } = await sign(lib, hashedCalldata);

  // call relayer with signed calldata
  let tx = await relayer.execute((await memberList.getAddress()), sender, calldata, v, r, s);
  console.log('txHash: ', tx.hash)
  await tx.wait()

  console.log(await memberList.list(sender));
}

async function main() {
  console.log('----- ', LIB.web3, ' -----')
  await run(LIB.web3);
  console.log('----- ', LIB.ethers, ' -----')
  await run(LIB.ethers)
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});