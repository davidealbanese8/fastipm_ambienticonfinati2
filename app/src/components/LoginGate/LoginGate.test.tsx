import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LoginGate } from './LoginGate';

describe('LoginGate', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });
  afterEach(() => {
    sessionStorage.clear();
  });

  it('shows the login form and hides children when not authenticated', () => {
    render(
      <LoginGate>
        <div>Protected content</div>
      </LoginGate>
    );
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('shows an inline error on wrong password and keeps content hidden', async () => {
    const user = userEvent.setup();
    render(
      <LoginGate>
        <div>Protected content</div>
      </LoginGate>
    );
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Entra' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Password non corretta.');
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('reveals children and persists the session flag on correct password', async () => {
    const user = userEvent.setup();
    render(
      <LoginGate>
        <div>Protected content</div>
      </LoginGate>
    );
    await user.type(screen.getByLabelText('Password'), 'Settembre');
    await user.click(screen.getByRole('button', { name: 'Entra' }));
    expect(screen.getByText('Protected content')).toBeInTheDocument();
    expect(sessionStorage.getItem('fastipm-authed')).toBe('1');
  });

  it('does not re-prompt on remount within the same session', () => {
    sessionStorage.setItem('fastipm-authed', '1');
    render(
      <LoginGate>
        <div>Protected content</div>
      </LoginGate>
    );
    expect(screen.getByText('Protected content')).toBeInTheDocument();
  });
});
