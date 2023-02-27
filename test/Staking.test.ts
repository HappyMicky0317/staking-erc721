import hre, { ethers } from 'hardhat';
import { expect } from 'chai';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { StakingToken } from '../typechain-types/contracts/StakingToken';
import { Staking } from '../typechain-types/contracts/Staking';
import { parseEther } from 'ethers/lib/utils';
import { BigNumber } from 'ethers';

describe("Test Staking contract", function () {
    let stakingToken: StakingToken;
    let staking: Staking;
    let deployer: SignerWithAddress;

    const zeroAddress = ethers.constants.AddressZero;
   
    // 0.005% per day
    const minimumRewards = (BigNumber.from(10).pow(13)).mul(5);
    // 0.02% per day
    const rewards1 = (BigNumber.from(10).pow(14)).mul(2);
    // 0.04% per day
    const rewards2 = (BigNumber.from(10).pow(14)).mul(4);
    // 0.1% per day
    const rewards3 = BigNumber.from(10).pow(15);

    function daysToSeconds(days: number): number {
        return days * 60 * 60 * 24;
    }

    async function latestBlockTimestamp(): Promise<number> {
        return (await ethers.provider.getBlock('latest')).timestamp;
    }

    async function increaseTime(days: number) {
        await ethers.provider.send('evm_mine',
            [await latestBlockTimestamp() + daysToSeconds(days)]);
    }

    it("Should revert when setting token address to the zero address", async function () {
        [deployer] = await ethers.getSigners();
        const Staking = await hre.ethers.getContractFactory("Staking");
        const staking = Staking.deploy(
            minimumRewards, rewards1, rewards2, rewards3, zeroAddress
        );

        await expect(staking).to.be.revertedWith("Token address cannot be the zero address");
    });

    describe("Test Staking contract", function () {
        beforeEach(async function () {
            [deployer] = await ethers.getSigners();

            // deploy StakingToken contract
            const StakingToken = await hre.ethers.getContractFactory("StakingToken");
            stakingToken = await StakingToken.deploy();
            await stakingToken.deployed();

            // deploy Staking contract
            const Staking = await hre.ethers.getContractFactory("Staking");
            staking = await Staking.deploy(
                minimumRewards, rewards1, rewards2, rewards3, stakingToken.address
            );
            await staking.deployed();

            // transfer 10% of all tokens to the Staking contract
            const deployerBalance = await stakingToken.balanceOf(deployer.address);
            await stakingToken.transfer(staking.address, deployerBalance.mul(10).div(100));
        });

        describe("Test Staking contract metadata", function () {
            it("Should assign minimum rewards correctly", async function () {
                expect(await staking.minimumRate()).to.be.equal(minimumRewards);
            });

            it("Should assign rewards 1 correctly", async function () {
                expect(await staking.rewardsRate1()).to.be.equal(rewards1);
            })

            it("Should assign rewards 2 correctly", async function () {
                expect(await staking.rewardsRate2()).to.be.equal(rewards2);
            });

            it("Should assign rewards 3 correctly", async function () {
                expect(await staking.rewardsRate3()).to.be.equal(rewards3);
            });

            it("Should assign to the correct token", async function () {
                expect(await staking.token()).to.be.equal(stakingToken.address);
            });

            it("Should assign to the correct Staking contract admin", async function () {
                expect(await staking.owner()).to.be.equal(deployer.address)
            });

            it("Initial id counter should be zero", async function () {
                expect(await staking.idCounter()).to.be.equal(0);
            });

            it("Token balance of the Staking contract should be 10% of the total token supply", async function () {
                const totalTokenSupply = await stakingToken.totalSupply();
                expect(await stakingToken.balanceOf(staking.address)).to.be.equal(totalTokenSupply.mul(10).div(100));
            });
        });

        it("withdrawable amount", async function () {
            await stakingToken.approve(staking.address, parseEther("100"));
            await staking.stake(parseEther("100"), 30);
            await increaseTime(33);
            const withdrawable = await staking.withdrawableAmount(0);
            console.log(withdrawable);
        });

        describe("Test getUserStakingInfo function", function () {
            it("Get user staking info correctly", async function () {
                const timestamp = await latestBlockTimestamp();

                await stakingToken.approve(staking.address, parseEther("6000"))
                await staking.stake(parseEther("1000"), 30);
                await staking.stake(parseEther("2000"), 180);
                await staking.stake(parseEther("3000"), 1460);

                expect((await staking.getUserStakingInfo(deployer.address)).length).to.be.equal(3);
                // can't test the exact time 
                // workaround: The time offset is 1s => stakedTime = timestamp + 1. How to solve?
                expect((await staking.getUserStakingInfo(deployer.address))).to.be.deep.equal(
                    [[BigNumber.from(0),
                    parseEther("1000"),
                    BigNumber.from(30),
                    BigNumber.from(timestamp + 1)],
                    [BigNumber.from(1),
                    parseEther("2000"),
                    BigNumber.from(180),
                    BigNumber.from(timestamp + 1)],
                    [BigNumber.from(2),
                    parseEther("3000"),
                    BigNumber.from(1460),
                    BigNumber.from(timestamp + 1)]]
                );
                expect((await staking.getUserStakingInfo(deployer.address))[1]).to.be.deep.equal(
                    [BigNumber.from(1),
                    parseEther("2000"),
                    BigNumber.from(180),
                    BigNumber.from(timestamp + 1)]
                );
            });
        });

        describe("Test stake function", function () {
            it("Should stake tokens correctly", async function () {
                const userBalance = await stakingToken.balanceOf(deployer.address);
                const stakingBalance = await stakingToken.balanceOf(staking.address);
                const userStakingInfoLength = (await staking.getUserStakingInfo(deployer.address)).length;
                const idCounter = await staking.idCounter();

                await stakingToken.approve(staking.address, parseEther("200"));
                await staking.stake(parseEther("200"), 30);

                const userBalanceUpdated = await stakingToken.balanceOf(deployer.address);
                const stakingBalanceUpdated = await stakingToken.balanceOf(staking.address);
                const userStakingInfoLengthUpdated = (await staking.getUserStakingInfo(deployer.address)).length;

                // transfer tokens from the user to the staking contract
                expect(stakingBalanceUpdated).to.be.equal(stakingBalance.add(parseEther("200")));
                expect(userBalanceUpdated).to.be.equal(userBalance.sub(parseEther("200")));

                // save new user staking info
                expect(userStakingInfoLengthUpdated).to.be.equal(userStakingInfoLength + 1);

                // increment id counter
                expect(await staking.idCounter()).to.be.equal(idCounter.add(1))
            });

            it("Should save staking info correctly", async function () {
                const timestamp = await latestBlockTimestamp();
                const idCounter = await staking.idCounter();

                await stakingToken.approve(staking.address, parseEther("200"));
                await staking.stake(parseEther("200"), 30);

                expect((await staking.getUserStakingInfo(deployer.address))[0]).to.be.deep.equal(
                    [idCounter,
                        parseEther("200"),
                        BigNumber.from(30),
                        BigNumber.from(timestamp + 1)]
                );
            });

            it("Should emit Stake event with correct data", async function () {
                const idCounter = await staking.idCounter();
                const timestamp = await latestBlockTimestamp();

                await stakingToken.approve(staking.address, parseEther("500"));
                const tx = staking.stake(parseEther("500"), 1460);

                await expect(tx).to.emit(staking, "Stake").withArgs(
                    deployer.address, idCounter, parseEther("500"), timestamp + 1, 1460
                )
            })

            it("Should revert because of invalid amount", async function () {
                const tx = staking.stake(0, parseEther("500"));
                await expect(tx).to.be.revertedWith("Amount must be greater than 0");
            });

            it("Should revert because of invalid staking period", async function () {
                await stakingToken.approve(staking.address, parseEther("100"));
                const tx = staking.stake(parseEther("100"), 1)
                await expect(tx).to.be.revertedWith("Invalid staking period");
            });
        });

        describe("test stakeBatch function", function () {
            it("Should stake tokens in batch correctly", async function () {
                const timestamp = await latestBlockTimestamp();

                await stakingToken.approve(staking.address, parseEther("6300"));
                await staking.stake(parseEther("1000"), 1460);
                await staking.stakeBatch([parseEther("5000"), parseEther("300")], [30, 180]);

                expect((await staking.getUserStakingInfo(deployer.address)).length).to.be.equal(3);
                expect((await staking.getUserStakingInfo(deployer.address))).to.be.deep.equal(
                    [[BigNumber.from(0),
                    parseEther("1000"),
                    BigNumber.from(1460),
                    BigNumber.from(timestamp + 1)],
                    [BigNumber.from(1),
                    parseEther("5000"),
                    BigNumber.from(30),
                    BigNumber.from(timestamp + 1)],
                    [BigNumber.from(2),
                    parseEther("300"),
                    BigNumber.from(180),
                    BigNumber.from(timestamp + 1)]]
                );
            });

            it("Should revert because amounts and staking periods length mismatch", async function () {
                await stakingToken.approve(staking.address, parseEther("3300"));
                const tx = staking.stakeBatch([parseEther("3000"), parseEther("300")], [30, 180, 1460]);
                
                await expect(tx).to.be.revertedWith("Amounts and staking periods length mismatch")
            });
        });

        describe("test extendStakingPeriod function", function () {
            it("Should extend the staking period correctly", async function () {
                await stakingToken.approve(staking.address, parseEther("6000"));
                await staking.stakeBatch([parseEther("2000"), parseEther("4000")], [180, 1460]);
                await increaseTime(1500);
                const timestamp = await latestBlockTimestamp();

                const withdrawableAmountBeforeExtend = await staking.withdrawableAmount(1);
                await stakingToken.approve(staking.address, withdrawableAmountBeforeExtend);
                await staking.extendStakingPeriod(1, 1460);

                const stakingInfo = await staking.getUserStakingInfo(deployer.address)

                expect(stakingInfo[1].id).to.equal(0);
                expect(stakingInfo[2]).to.be.deep.equal([BigNumber.from(2),
                    withdrawableAmountBeforeExtend,
                BigNumber.from(1460),
                BigNumber.from(timestamp + 1)]);
            });

            it("Should revert because of invalid id", async function () {
                await stakingToken.approve(staking.address, parseEther("300"));
                await staking.stake(parseEther("300"), 1460);
                await increaseTime(1500);

                const tx = staking.extendStakingPeriod(2, 30);
                    
                await expect(tx).to.be.reverted;
            });

            it("Should revert because of invalid staking period", async function () {
                await stakingToken.approve(staking.address, parseEther("200"));
                await staking.stake(parseEther("200"), 180);
                await increaseTime(180);

                const tx = staking.extendStakingPeriod(0, 10);
                await expect(tx).to.be.revertedWith("Invalid staking period");
            });

            it("Should revert because the current staking period has not ended", async function () {
                const tx = staking.stake(parseEther("200"), 10);
                await expect(tx).to.be.revertedWith("Invalid staking period");
            });
        })

        describe("test withdrawAll function", function () {
            it("Should withdraw all staking tokens from an id correctly", async function () {

                await stakingToken.approve(staking.address, parseEther("14000"));
                await staking.stakeBatch(
                    [parseEther("5000"), parseEther("7000"), parseEther("2000")], [30, 30, 180]
                );
                const stakingBalance = await stakingToken.balanceOf(staking.address);

                await increaseTime(30);
                const withdrawableAmount = await staking.withdrawableAmount(0);
                await staking.withdrawAll(0);

                const stakingInfo = await staking.getUserStakingInfo(deployer.address);
                const stakingBalanceUpddated = await stakingToken.balanceOf(staking.address);

                expect(stakingInfo[0].id).to.equal(0);
                expect(stakingInfo[0].stakedAmount).to.equal(0);
                expect(stakingBalanceUpddated).to.be.equal(stakingBalance.sub(withdrawableAmount));
            });

            it("Should revert because of invalid id", async function () {
                await stakingToken.approve(staking.address, parseEther("14000"));
                await staking.stake(parseEther("30"), 1460);

                await increaseTime(1460);
                const tx = staking.withdrawAll(3);

                await expect(tx).to.be.reverted;
            });

            it("Should revert because the current staking period has not ended", async function () {

            });
        });

        describe("test withdraw function", function () {
            it("Should withdraw staking tokens from an id correctly", async function () {
                await stakingToken.approve(staking.address, parseEther("3300"));
                await staking.stakeBatch(
                    [parseEther("600"), parseEther("700"), parseEther("2000")], [180, 30, 180]
                );

                await increaseTime(200);
                const userBalance = await stakingToken.balanceOf(deployer.address);
                const withdrawableAmount = await staking.withdrawableAmount(1);
                await staking.withdraw(1, parseEther("500"));

                const userBalanceUpdated = await stakingToken.balanceOf(deployer.address);
                const stakingInfo = await staking.getUserStakingInfo(deployer.address);

                expect(stakingInfo[3].stakedAmount).to.be.equal(withdrawableAmount.sub(500));
                expect(userBalanceUpdated).to.be.equal(userBalance.add(parseEther("500")));
            });

            it("Should revert because the withdraw amount exceeds the withdrawable amount", async function () {
                await stakingToken.approve(staking.address, parseEther("4000"));
                await staking.stakeBatch(
                    [parseEther("600"), parseEther("1400"), parseEther("2000")], [180, 30, 180]
                );

                await increaseTime(200);
                // const userBalance = await stakingToken.balanceOf(deployer.address);
                const withdrawableAmount = await staking.withdrawableAmount(1);
                const tx = staking.withdraw(1, withdrawableAmount.add(200));
                expect(tx).to.be.revertedWith("Withdraw amount exceeds the withdrawable amount");
            });

            it("Should revert because of invalid id", async function () {
                await stakingToken.approve(staking.address, parseEther("4000"));
                await staking.stakeBatch(
                    [parseEther("600"), parseEther("1400"), parseEther("2000")], [180, 30, 180]
                );

                await increaseTime(200);
                // const userBalance = await stakingToken.balanceOf(deployer.address);
                await staking.withdraw(5, parseEther("100"));
            });

            it("Should revert because of invalid amount", async function () {
                await stakingToken.approve(staking.address, parseEther("4000"));
                await staking.stakeBatch(
                    [parseEther("600"), parseEther("1400"), parseEther("2000")], [180, 30, 180]
                );

                await increaseTime(200);
                // const userBalance = await stakingToken.balanceOf(deployer.address);
                const tx = staking.withdraw(1, 0);
                await expect(tx).to.be.revertedWith("Amount must be greater than 0");
            });

            it("Should revert because the current staking period has not ended", async function () {
                await stakingToken.approve(staking.address, parseEther("2000"));
                await staking.stakeBatch(
                    [parseEther("600"), parseEther("400"), parseEther("1000")], [180, 30, 180]
                );

                const tx = staking.withdraw(0, parseEther("100"));
                expect(tx).to.be.revertedWith("The current staking period has not ended");
            });
        })

        describe("test withdrawBatch", function () {
            it("Should withdraw tokens in batch correctly", async function () {
                await stakingToken.approve(staking.address, parseEther("2000"));
                await staking.stake(parseEther("400"), 180);
                await staking.stakeBatch(
                    [parseEther("1000"), parseEther("500"), parseEther("100")], [30, 180, 1460]
                );

                const stakingBalance = await stakingToken.balanceOf(staking.address);
                await staking.withdrawBatch([0, 1], [parseEther("300"), parseEther("400")]);
                const stakingBalanceUpdated = await stakingToken.balanceOf(staking.address);
                const stakingInfo = await staking.getUserStakingInfo(deployer.address);

                expect(stakingBalanceUpdated).to.be.equal(stakingBalance.sub(300).sub(400));
                expect(stakingInfo.length).to.be.equal(6);
            });

            it("Should revert because amounts and ids length mismatch", async function () {
                await stakingToken.approve(staking.address, parseEther("800"));
                await staking.stakeBatch(
                    [parseEther("100"), parseEther("300"), parseEther("400")], [30, 180, 1460]
                );

                const tx = staking.withdrawBatch([0, 1], [parseEther("50"), parseEther("100"), parseEther("300")]);

                await expect(tx).revertedWith("Amounts and ids length mismatch");
            });
        });
    });
}
)