import { FC, useState, useEffect } from 'react';
import { keyBy } from 'lodash';

import { useAppSelector, useAppDispatch, useAppDispatchAndUnwrap, useDebounce } from '@hooks';
import { TokensSelectors, VaultsSelectors, VaultsActions, TokensActions, SettingsSelectors } from '@store';
import {
  toBN,
  normalizeAmount,
  USDC_DECIMALS,
  validateVaultWithdraw,
  validateVaultWithdrawAllowance,
  calculateSharesAmount,
} from '@src/utils';
import { getConfig } from '@config';

import { Transaction } from './Transaction';
export interface WithdrawTxProps {
  header?: string;
  onClose?: () => void;
}

export const WithdrawTx: FC<WithdrawTxProps> = ({ header, onClose, children, ...props }) => {
  const { CONTRACT_ADDRESSES } = getConfig();
  const dispatch = useAppDispatch();
  const dispatchAndUnwrap = useAppDispatchAndUnwrap();
  const [amount, setAmount] = useState('');
  const [debouncedAmount, isDebouncePending] = useDebounce(amount, 500);
  const [txCompleted, setTxCompleted] = useState(false);
  const selectedVault = useAppSelector(VaultsSelectors.selectSelectedVault);
  const zapOutTokens = useAppSelector(TokensSelectors.selectZapOutTokens);
  const [selectedTargetTokenAddress, setSelectedTargetTokenAddress] = useState(
    selectedVault?.defaultDisplayToken ?? ''
  );
  const selectedSlippage = useAppSelector(SettingsSelectors.selectDefaultSlippage).toString();
  const targetTokensOptions = selectedVault
    ? [selectedVault.token, ...zapOutTokens.filter(({ address }) => address !== selectedVault.token.address)]
    : zapOutTokens;
  const targetTokensOptionsMap = keyBy(targetTokensOptions, 'address');
  const selectedTargetToken = targetTokensOptionsMap[selectedTargetTokenAddress];
  const expectedTxOutcome = useAppSelector(VaultsSelectors.selectExpectedTxOutcome);
  const expectedTxOutcomeStatus = useAppSelector(VaultsSelectors.selectExpectedTxOutcomeStatus);
  const actionsStatus = useAppSelector(VaultsSelectors.selectSelectedVaultActionsStatusMap);

  // TODO Fix logic for vault details
  const yvTokenAmount = selectedVault
    ? calculateSharesAmount({
        amount: toBN(debouncedAmount),
        decimals: selectedVault!.decimals,
        pricePerShare: selectedVault!.pricePerShare,
      })
    : '';
  const yvTokenAmountNormalized = normalizeAmount(yvTokenAmount, toBN(selectedVault?.decimals).toNumber());

  const onExit = () => {
    dispatch(VaultsActions.clearSelectedVaultAndStatus());
    dispatch(VaultsActions.clearTransactionData());
    dispatch(TokensActions.setSelectedTokenAddress({ tokenAddress: undefined }));
  };

  useEffect(() => {
    return () => {
      onExit();
    };
  }, []);

  useEffect(() => {
    if (!selectedVault) return;

    dispatch(
      TokensActions.getTokenAllowance({
        tokenAddress: selectedVault.address,
        spenderAddress: CONTRACT_ADDRESSES.zapOut,
      })
    );
  }, [selectedTargetTokenAddress]);

  useEffect(() => {
    if (!selectedVault) return;
    dispatch(VaultsActions.clearVaultStatus({ vaultAddress: selectedVault.address }));
  }, [debouncedAmount, selectedTargetTokenAddress, selectedVault]);

  useEffect(() => {
    if (!selectedVault || !selectedTargetTokenAddress) return;
    if (toBN(debouncedAmount).gt(0) && !inputError) {
      dispatch(
        VaultsActions.getExpectedTransactionOutcome({
          transactionType: 'WITHDRAW',
          sourceTokenAddress: selectedVault.address,
          sourceTokenAmount: yvTokenAmount,
          targetTokenAddress: selectedTargetTokenAddress,
        })
      );
    }
  }, [debouncedAmount]);

  if (!selectedVault || !selectedTargetToken || !targetTokensOptions) {
    return null;
  }

  const { approved: isApproved, error: allowanceError } = validateVaultWithdrawAllowance({
    yvTokenAddress: selectedVault.address,
    yvTokenAmount: toBN(yvTokenAmountNormalized),
    yvTokenDecimals: selectedVault.decimals,
    underlyingTokenAddress: selectedVault.token.address,
    targetTokenAddress: selectedTargetTokenAddress,
    yvTokenAllowancesMap: selectedVault.allowancesMap,
  });

  const { approved: isValidAmount, error: inputError } = validateVaultWithdraw({
    yvTokenAmount: toBN(yvTokenAmountNormalized),
    yvTokenDecimals: selectedVault.decimals,
    userYvTokenBalance: selectedVault.DEPOSIT.userBalance,
  });

  // TODO: NEED A CLEAR ERROR ACTION ON MODAL UNMOUNT
  const error =
    allowanceError ||
    inputError ||
    actionsStatus.approveZapOut.error ||
    actionsStatus.withdraw.error ||
    expectedTxOutcomeStatus.error;

  const selectedVaultOption = {
    address: selectedVault.address,
    symbol: selectedVault.displayName,
    icon: selectedVault.displayIcon,
    balance: selectedVault.DEPOSIT.userDeposited,
    balanceUsdc: selectedVault.DEPOSIT.userDepositedUsdc,
    decimals: selectedVault.token.decimals,
  };
  const amountValue = toBN(amount).times(normalizeAmount(selectedVault.token.priceUsdc, USDC_DECIMALS)).toString();
  const expectedAmount = toBN(debouncedAmount).gt(0)
    ? normalizeAmount(expectedTxOutcome?.targetTokenAmount, selectedTargetToken?.decimals)
    : '';
  const expectedAmountValue = toBN(debouncedAmount).gt(0)
    ? normalizeAmount(expectedTxOutcome?.targetTokenAmountUsdc, USDC_DECIMALS)
    : '0';
  const expectedAmountStatus = {
    error: expectedTxOutcomeStatus.error,
    loading: expectedTxOutcomeStatus.loading || isDebouncePending,
  };

  const onSelectedTargetTokenChange = (tokenAddress: string) => {
    setAmount('');
    setSelectedTargetTokenAddress(tokenAddress);
  };

  const onTransactionCompletedDismissed = () => {
    if (onClose) onClose();
  };

  const approve = async () => {
    await dispatch(VaultsActions.approveZapOut({ vaultAddress: selectedVault.address }));
  };

  const withdraw = async () => {
    try {
      await dispatchAndUnwrap(
        VaultsActions.withdrawVault({
          vaultAddress: selectedVault.address,
          amount: toBN(amount),
          targetTokenAddress: selectedTargetTokenAddress,
          slippageTolerance: toBN(selectedSlippage).toNumber(),
        })
      );
      setTxCompleted(true);
    } catch (error) {}
  };

  const txActions = [
    {
      label: 'Approve',
      onAction: approve,
      status: actionsStatus.approveZapOut,
      disabled: isApproved,
    },
    {
      label: 'Withdraw',
      onAction: withdraw,
      status: actionsStatus.withdraw,
      disabled: !isApproved || !isValidAmount || expectedTxOutcomeStatus.loading,
      contrast: true,
    },
  ];

  return (
    <Transaction
      transactionLabel={header}
      transactionCompleted={txCompleted}
      transactionCompletedLabel="Exit"
      onTransactionCompletedDismissed={onTransactionCompletedDismissed}
      sourceHeader="From vault"
      sourceAssetOptions={[selectedVaultOption]}
      selectedSourceAsset={selectedVaultOption}
      sourceAmount={amount}
      sourceAmountValue={amountValue}
      onSourceAmountChange={setAmount}
      targetHeader="To wallet"
      targetAssetOptions={targetTokensOptions}
      selectedTargetAsset={selectedTargetToken}
      onSelectedTargetAssetChange={onSelectedTargetTokenChange}
      targetAmount={expectedAmount}
      targetAmountValue={expectedAmountValue}
      targetAmountStatus={expectedAmountStatus}
      actions={txActions}
      status={{ error }}
      onClose={onClose}
    />
  );
};
