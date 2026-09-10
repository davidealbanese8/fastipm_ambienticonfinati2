// app/src/components/common/Combobox.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Combobox, type ComboboxOption } from './Combobox';

const OPTIONS: ComboboxOption[] = [
  { value: 'a', label: 'Alessia Costa' },
  { value: 'm', label: 'Matteo De Luca' },
  { value: 's', label: 'Simone Fontana' },
];

describe('Combobox — select mode', () => {
  it('shows the label of the current value, not the raw value', () => {
    render(<Combobox options={OPTIONS} value="m" onChange={() => {}} />);
    expect(screen.getByRole('combobox')).toHaveValue('Matteo De Luca');
  });

  it('does not call onChange while typing — only on pick', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Combobox options={OPTIONS} value="" onChange={onChange} placeholder="Seleziona" />);
    await user.type(screen.getByRole('combobox'), 'Ale');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('filters options by typed text and calls onChange on click', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Combobox options={OPTIONS} value="" onChange={onChange} placeholder="Seleziona" />);
    await user.type(screen.getByRole('combobox'), 'ale');
    const option = await screen.findByRole('option', { name: 'Alessia Costa' });
    expect(screen.queryByRole('option', { name: 'Matteo De Luca' })).not.toBeInTheDocument();
    await user.click(option);
    expect(onChange).toHaveBeenCalledWith('a');
    expect(screen.getByRole('combobox')).toHaveValue('Alessia Costa');
  });

  it('selects the highlighted option with ArrowDown + Enter', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Combobox options={OPTIONS} value="" onChange={onChange} placeholder="Seleziona" />);
    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith('m');
  });

  it('reverts the displayed text on Escape without committing', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Combobox options={OPTIONS} value="m" onChange={onChange} />);
    const input = screen.getByRole('combobox');
    await user.clear(input);
    await user.type(input, 'zzz');
    await user.keyboard('{Escape}');
    expect(input).toHaveValue('Matteo De Luca');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders group headers for grouped options', async () => {
    const grouped: ComboboxOption[] = [
      { value: 'a', label: 'Alessia Costa', group: 'Centro' },
      { value: 'b', label: 'Andrea Gallo', group: 'Nord Ovest' },
    ];
    const user = userEvent.setup();
    render(<Combobox options={grouped} value="" onChange={() => {}} />);
    await user.click(screen.getByRole('combobox'));
    expect(await screen.findByText('Centro')).toBeInTheDocument();
    expect(screen.getByText('Nord Ovest')).toBeInTheDocument();
  });
});

describe('Combobox — freeSolo mode', () => {
  it('calls onChange on every keystroke', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Combobox options={[]} value="" onChange={onChange} freeSolo placeholder="Cerca" />);
    await user.type(screen.getByRole('combobox'), 'abc');
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(onChange).toHaveBeenLastCalledWith('abc');
  });

  it('clicking a suggestion sets the exact text and calls onChange', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Combobox options={OPTIONS} value="" onChange={onChange} freeSolo placeholder="Cerca" />);
    await user.type(screen.getByRole('combobox'), 'sim');
    const option = await screen.findByRole('option', { name: 'Simone Fontana' });
    await user.click(option);
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveValue('Simone Fontana'));
    expect(onChange).toHaveBeenLastCalledWith('Simone Fontana');
  });
});
