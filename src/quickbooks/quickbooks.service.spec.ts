import { QuickbooksService } from './quickbooks.service';

function setup(bills: { Id: string; Balance: number }[], vendor: any = { qboVendorId: '58' }) {
  const payout: any = { id: 'p1', vendorId: 'v1', amount: { toFixed: () => '12.50' }, qboBillPaymentId: null };
  const prisma: any = {
    payout: { findUnique: jest.fn(async () => payout), update: jest.fn(async ({ data }: any) => Object.assign(payout, data)) },
    vendor: { findUnique: jest.fn(async () => vendor) },
  };
  const svc = new QuickbooksService(prisma);
  const calls: any[] = [];
  (svc as any).api = jest.fn(async (method: string, path: string, body?: any) => {
    calls.push({ method, path, body });
    return method === 'GET' ? { QueryResponse: { Bill: bills } } : { BillPayment: { Id: 'BP1' } };
  });
  return { svc, payout, calls };
}

describe('QuickbooksService.recordPayout', () => {
  beforeEach(() => {
    process.env.QBO_CLIENT_ID = 'id';
    process.env.QBO_CLIENT_SECRET = 'secret';
    process.env.QBO_BANK_ACCOUNT_ID = '80';
  });

  it('pays the open Bill with the matching balance from the configured account', async () => {
    const { svc, payout, calls } = setup([{ Id: '1', Balance: 99 }, { Id: '2', Balance: 12.5 }]);
    expect(await svc.recordPayout('p1')).toBe('BP1');
    expect(payout.qboBillPaymentId).toBe('BP1');
    const post = calls.find((c) => c.method === 'POST');
    expect(post.path).toContain('requestid=p1');
    expect(post.body.CheckPayment.BankAccountRef.value).toBe('80');
    expect(post.body.Line[0].LinkedTxn[0]).toEqual({ TxnId: '2', TxnType: 'Bill' });
  });

  it('posts nothing when no Bill matches or the vendor is unmapped', async () => {
    const none = setup([{ Id: '1', Balance: 99 }]);
    expect(await none.svc.recordPayout('p1')).toBeNull();
    expect(none.calls.some((c) => c.method === 'POST')).toBe(false);
    const unmapped = setup([], { qboVendorId: null });
    expect(await unmapped.svc.recordPayout('p1')).toBeNull();
    expect(unmapped.calls).toHaveLength(0);
  });

  it('is idempotent and never throws', async () => {
    const done = setup([]);
    done.payout.qboBillPaymentId = 'BP9';
    expect(await done.svc.recordPayout('p1')).toBe('BP9');
    expect(done.calls).toHaveLength(0);
    const broken = setup([{ Id: '2', Balance: 12.5 }]);
    (broken.svc as any).api = jest.fn(async () => { throw new Error('down'); });
    await expect(broken.svc.recordPayout('p1')).resolves.toBeNull();
  });
});
