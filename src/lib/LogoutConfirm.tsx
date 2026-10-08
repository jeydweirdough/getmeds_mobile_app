import { useConfirm } from '@/lib/ConfirmDialog';

/**
 * LogoutConfirm.tsx
 * ─────────────────────────────────────────────
 * "Are you sure?" before signing out, shared by every Log out button (the
 * points card and the account menu), so the question reads the same wherever
 * it is asked. The dialog itself is the app's ConfirmDialog.
 *
 *   const logout = useConfirmLogout(() => signOut());
 *   <button onClick={logout.ask}>Log out</button>
 *   {logout.dialog}
 */

export function useConfirmLogout(action: () => void) {
  return useConfirm(action, {
    title: ['Log out of Getmeds?', 'Mag-log out sa Getmeds?'],
    body: [
      'You will need to sign in again to see your points and account details.',
      'Kailangan mong mag-log in ulit para makita ang points at detalye ng account mo.',
    ],
    confirm: ['Log out', 'Mag-log out'],
  });
}
