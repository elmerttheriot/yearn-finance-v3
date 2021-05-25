import styled from 'styled-components';
import { useAppSelector, useAppDispatch } from '@hooks';
import { ModalsActions, ModalSelectors } from '@core/store';

import { TestModal } from './TestModal';
import { DepositModal } from './DepositModal';

const StyledModals = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: ${({ theme }) => theme.zindex.modals};
`;

const StyledBackdrop = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: 100%;
  pointer-events: all;
  background-color: rgba(0, 0, 0, 0.4);
  z-index: 0;

  @media (min-width: ${({ theme }) => theme.devices.tablet}px) {
    backdrop-filter: blur(11px);
  }
`;

// TODO dynamic modals list
// const MODALS = [
//   {
//     name: 'test',
//     component: TestModal,
//   },
// ];

interface BackdropProps {
  onClick?: () => void;
}

export const Backdrop = ({ onClick }: BackdropProps) => {
  return <StyledBackdrop onClick={onClick} />;
};

export const Modals = () => {
  const dispatch = useAppDispatch();
  const activeModal = useAppSelector(ModalSelectors.selectActiveModal);

  const closeModal = () => dispatch(ModalsActions.closeModal());

  let backdrop;

  if (activeModal) {
    backdrop = <Backdrop onClick={closeModal} />;
  }

  return (
    <StyledModals>
      {activeModal === 'test' && <TestModal onClose={closeModal} />}
      {activeModal === 'deposit' && <DepositModal onClose={closeModal} />}
      {backdrop}
    </StyledModals>
  );
};
