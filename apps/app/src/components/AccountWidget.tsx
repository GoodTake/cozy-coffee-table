import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useUser } from '../lib/useUser';

const shortAddress = (wallet: string) => `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;

// A small account control for the header. Booking a table never needs it.
export function AccountWidget() {
  const { wallet, needsSignIn, signIn, loading } = useUser();
  if (loading) return null;

  if (!wallet) {
    return (
      <ConnectButton.Custom>
        {({ openConnectModal, mounted }) => (
          <button className="account-button" type="button" onClick={openConnectModal} disabled={!mounted}>
            Connect wallet
          </button>
        )}
      </ConnectButton.Custom>
    );
  }

  if (needsSignIn) {
    return (
      <button className="account-button" type="button" onClick={signIn}>
        Sign in
      </button>
    );
  }

  return (
    <ConnectButton.Custom>
      {({ openAccountModal }) => (
        <button className="account-chip" type="button" onClick={openAccountModal} title={wallet}>
          <span className="account-dot" aria-hidden="true" />
          Signed in as {shortAddress(wallet)}
        </button>
      )}
    </ConnectButton.Custom>
  );
}
