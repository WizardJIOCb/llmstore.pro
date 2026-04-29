import { useEffect, useState } from 'react';
import type { AppSettings } from '../../lib/api/app';
import { useCreateYooKassaTopUp, usePaymentsConfig } from '../../hooks/usePayments';
import { formatRubAmount, resolveTopUpAmounts } from '../../lib/payment-pricing';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { TopUpHelp } from './TopUpHelp';

interface BalanceTopUpPanelProps {
  settings: AppSettings | undefined;
}

export function BalanceTopUpPanel({ settings }: BalanceTopUpPanelProps) {
  const { data: paymentsConfig } = usePaymentsConfig();
  const createTopUpMutation = useCreateYooKassaTopUp();
  const [amountRub, setAmountRub] = useState('');
  const presetAmounts = resolveTopUpAmounts(paymentsConfig?.preset_amounts_rub);

  useEffect(() => {
    if (!paymentsConfig || amountRub) return;
    const defaultAmount = presetAmounts[0] ?? paymentsConfig.min_amount_rub;
    setAmountRub(String(defaultAmount));
  }, [paymentsConfig, amountRub, presetAmounts]);

  const handlePay = (rawAmount: number) => {
    createTopUpMutation.mutate(
      { amount_rub: rawAmount },
      {
        onSuccess: (result) => {
          window.location.href = result.confirmation_url;
        },
      },
    );
  };

  const handleCustomPay = () => {
    handlePay(Number(amountRub));
  };

  if (!paymentsConfig?.enabled) {
    return <TopUpHelp settings={settings} className="mt-3" />;
  }

  return (
    <div className="mt-4 rounded-lg border bg-muted/20 p-4">
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-medium">Пополнить баланс через YooKassa</p>
          <p className="text-xs text-muted-foreground">
            После оплаты баланс зачислится автоматически. Готовые суммы: {presetAmounts.map(formatRubAmount).join(', ')}.
            {' '}Другую сумму можно ввести в пределах {formatRubAmount(paymentsConfig.min_amount_rub)} - {formatRubAmount(paymentsConfig.max_amount_rub)}.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {presetAmounts.map((presetAmount) => (
            <Button
              key={presetAmount}
              size="sm"
              variant="outline"
              disabled={createTopUpMutation.isPending}
              onClick={() => handlePay(presetAmount)}
            >
              {formatRubAmount(presetAmount)}
            </Button>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            type="number"
            min={paymentsConfig.min_amount_rub}
            max={paymentsConfig.max_amount_rub}
            step={100}
            value={amountRub}
            onChange={(e) => setAmountRub(e.target.value)}
            placeholder="Сумма в рублях"
          />
          <Button
            className="sm:min-w-[180px]"
            onClick={handleCustomPay}
            disabled={createTopUpMutation.isPending || !amountRub}
          >
            {createTopUpMutation.isPending ? 'Переходим к оплате...' : 'Оплатить'}
          </Button>
        </div>

        {createTopUpMutation.error && (
          <p className="text-sm text-destructive">
            {(createTopUpMutation.error as any)?.response?.data?.error?.message || 'Не удалось создать платёж'}
          </p>
        )}

        <TopUpHelp settings={settings} />
      </div>
    </div>
  );
}
