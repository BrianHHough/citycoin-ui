import React, { useRef, useState, useEffect } from 'react';
import { useConnect } from '@stacks/connect-react';
import { CONTRACT_DEPLOYER, CITYCOIN_CORE, NETWORK } from '../lib/constants';
import { BLOCK_HEIGHT, getStxFees, refreshBlockHeight } from '../lib/blocks';
import { useAtom } from 'jotai';
import { TxStatus } from './TxStatus';
import converter from 'number-to-words';
import { CityCoinMiningStats } from './CityCoinMiningStats';
import {
  AnchorMode,
  bufferCVFromString,
  FungibleConditionCode,
  listCV,
  makeStandardSTXPostCondition,
  noneCV,
  PostConditionMode,
  someCV,
  uintCV,
} from '@stacks/transactions';
import { CurrentBlockHeight } from './CurrentBlockHeight';
import { fetchAccount } from '../lib/account';

export function CityCoinMining({ ownerStxAddress }) {
  const amountRef = useRef();
  const mineManyRef = useRef();
  const memoRef = useRef();
  const [txId, setTxId] = useState();
  const [loading, setLoading] = useState();
  const [isError, setError] = useState();
  const [errorMsg, setErrorMsg] = useState('');
  const [buttonLabel, setButtonLabel] = useState('Mine');
  const [numberOfBlocks, setNumberOfBlocks] = useState();
  const [blockAmounts, setBlockAmounts] = useState([]);
  const [blockHeight, setBlockHeight] = useAtom(BLOCK_HEIGHT);
  const { doContractCall } = useConnect();

  const [profileState, setProfileState] = useState({
    account: undefined,
  });

  useEffect(() => {
    fetchAccount(ownerStxAddress).then(acc => {
      setProfileState({ account: acc });
    });
  }, [ownerStxAddress]);

  const [isDisabled, setIsDisabled] = useState(true);
  const [checked, setChecked] = useState(false);

  const canBeSubmitted = () => {
    return checked ? setIsDisabled(true) : setIsDisabled(false);
  };

  const onCheckboxClick = () => {
    setChecked(!checked);
    return canBeSubmitted();
  };

  useEffect(() => {
    refreshBlockHeight(setBlockHeight);
  }, [setBlockHeight]);

  const miningAlert = document.getElementById('miningAlert');

  const mineAction = async () => {
    miningAlert.innerHTML = '';
    setLoading(true);
    setError(false);
    setErrorMsg('');
    if (numberOfBlocks === 1 && amountRef.current.value === '') {
      setErrorMsg('Positive number required to mine.');
      setLoading(false);
      setError(true);
    } else if (numberOfBlocks > 200) {
      miningAlert.innerHTML = 'Cannot submit for more than 200 blocks.';
      setLoading(false);
      setError(true);
    } else {
      const estimatedFee = await getStxFees();
      const estimatedFeeUstx = estimatedFee * 1000000;
      const mineMany = numberOfBlocks > 1;

      console.log(`STX Balance: ${profileState.account.balance}`);
      console.log(`estimatedFee: ${estimatedFee}`);
      console.log(`mineMany: ${mineMany}`);

      let amountUstx = 0;
      let amountUstxCV = uintCV(0);
      let memo = '';
      let memoCV = noneCV();
      let sumArray = [];
      let mineManyArray = [];

      if (mineMany) {
        for (let i = 0; i < numberOfBlocks; i++) {
          sumArray.push(parseInt(blockAmounts[i].amount));
        }
        var sum = uintCV(sumArray.reduce((a, b) => a + b, 0) * 1000000);
        for (let i = 0; i < numberOfBlocks; i++) {
          mineManyArray.push(uintCV(blockAmounts[i].amount * 1000000));
        }
        mineManyArray = listCV(mineManyArray);
      } else {
        amountUstx = Math.floor(parseFloat(amountRef.current.value.trim()) * 1000000);
        amountUstxCV = uintCV(amountUstx);
        memo = memoRef.current.value.trim();
        memoCV = memo ? someCV(bufferCVFromString(memo)) : noneCV();
      }

      let totalSubmitted = 0;

      mineMany ? (totalSubmitted = sum.value) : (totalSubmitted = amountUstx);

      console.log(`total submitted ${totalSubmitted}`);

      // check there is enough left for fees
      if (totalSubmitted >= profileState.account.balance - estimatedFeeUstx) {
        miningAlert.innerHTML = `Not enough funds to cover transaction fee of ${estimatedFee} STX`;
        setLoading(false);
        setError(true);
      } else {
        try {
          await doContractCall({
            contractAddress: CONTRACT_DEPLOYER,
            contractName: CITYCOIN_CORE,
            functionName: mineMany ? 'mine-many' : 'mine-tokens',
            functionArgs: mineMany ? [mineManyArray] : [amountUstxCV, memoCV],
            postConditionMode: PostConditionMode.Deny,
            postConditions: [
              makeStandardSTXPostCondition(
                ownerStxAddress,
                FungibleConditionCode.Equal,
                mineMany ? sum.value : amountUstxCV.value
              ),
            ],
            anchorMode: AnchorMode.OnChainOnly,
            network: NETWORK,
            onCancel: () => {
              setLoading(false);
              setError(false);
            },
            onFinish: result => {
              setLoading(false);
              setError(false);
              setTxId(result.txId);
            },
          });
        } catch (e) {
          setLoading(false);
          setError(false);
        }
      }
    }
  };

  const updateValue = numberOfBlocks => {
    if (numberOfBlocks > 1) {
      for (let i = 1; i < (numberOfBlocks + 1) / 10; i++) {
        setBlockAmounts(currentBlock => [
          ...currentBlock,
          {
            num: i,
            amount: blockAmounts.amount,
          },
        ]);
      }
    } else {
      setButtonLabel('Mine');
    }
  };

  return (
    <>
      <h3>Mine CityCoins</h3>
      <CurrentBlockHeight />
      <p>
        Mining CityCoins is done by spending STX in a given Stacks block. A winner is selected
        randomly weighted by the miners' proportion of contributions of that block. Rewards can be
        withdrawn after a 100 block maturity window.
      </p>
      <form>
        <div className="form-floating">
          <input
            className="form-control"
            placeholder="Number of Blocks to Mine?"
            ref={mineManyRef}
            onChange={event => {
              setNumberOfBlocks(event.target.value);
              setBlockAmounts([]);
              updateValue(event.target.value);
            }}
            value={numberOfBlocks}
            id="mineMany"
          />
          <label htmlFor="mineMany">Number of Blocks to Mine?</label>
        </div>
        <br />
        <div className="input-group mb-3" hidden={numberOfBlocks != 1}>
          <input
            type="number"
            className="form-control"
            ref={amountRef}
            aria-label="Amount in STX"
            placeholder="Amount in STX"
            required
            minLength="1"
          />
          <div className="input-group-append">
            <span className="input-group-text">STX</span>
          </div>
        </div>
        <input
          ref={memoRef}
          className="form-control"
          type="text"
          placeholder="Memo (optional)"
          aria-label="Optional memo field"
          maxLength="34"
          hidden={numberOfBlocks != 1}
        />
        <div className="input-group">
          {blockAmounts.map(b => {
            return (
              <div className="m-3" key={b.num}>
                <label className="form-label" htmlFor={`miningAmount-${converter.toWords(b.num)}`}>
                  Block Commit {b.num}
                </label>
                <input
                  className="form-control"
                  id={`miningAmount-${converter.toWords(b.num)}`}
                  onChange={e => {
                    const amount = e.target.value;
                    setBlockAmounts(currentBlock =>
                      currentBlock.map(x =>
                        x.num === b.num
                          ? {
                              ...x,
                              amount,
                            }
                          : x
                      )
                    );
                    var sumArray = [];
                    for (let i = 0; i < numberOfBlocks; i++)
                      sumArray.push(parseInt(blockAmounts[i].amount));
                    sumArray = sumArray.filter(function (value) {
                      return !Number.isNaN(value);
                    });
                    setButtonLabel(`Mine for ${numberOfBlocks} blocks`);
                  }}
                  value={b.amount}
                  placeholder="STX Amount"
                />
              </div>
            );
          })}
        </div>
        <br />
        <button
          className="btn btn-block btn-primary mb-3"
          type="button"
          disabled={isDisabled}
          onClick={mineAction}
        >
          <div
            role="status"
            className={`${
              loading ? '' : 'd-none'
            } spinner-border spinner-border-sm text-info align-text-top mr-2`}
          />
          {buttonLabel}
        </button>
        <div className={`${isError ? '' : 'd-none'} alert alert-danger }`} id="miningAlert">
          {errorMsg}
        </div>
        <div className="form-check">
          <input
            className="form-check-input"
            type="checkbox"
            value=""
            id="flexCheckDefault"
            onClick={onCheckboxClick}
          />
          <label className="form-check-label" htmlFor="flexCheckDefault">
            I confirm I understand that the City of Miami has not yet officially claimed the
            MiamiCoin protocol contribution. I also acknowledge that my participation in mining
            MiamiCoin ($MIA) does not guarantee winning the rights to claim newly minted $MIA.
          </label>
        </div>
      </form>
      {txId && <TxStatus txId={txId} />}
    </>
  );
}
