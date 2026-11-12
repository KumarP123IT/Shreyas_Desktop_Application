/**
 * Prisma seed file – creates:
 *  - Admin user (random generated password, printed once to console)
 *  - Global MSL defaults (Min 100 / Max 500)
 *  - Demo customer: Kirloskar Toyota Textile Machinery Pvt Ltd
 *  - Default reminder rules (10, 5, 3, 1 days before due)
 *  - Default app settings
 *  - Demo forecast + delivery with sample KTTM parts
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

const prisma = new PrismaClient();

/** Generate a secure random password: 12 chars, mixed case + digits */
function generatePassword() {
  const upper  = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower  = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const all    = upper + lower + digits;
  const bytes  = crypto.randomBytes(12);
  const pw = [
    upper[bytes[0] % upper.length],
    lower[bytes[1] % lower.length],
    digits[bytes[2] % digits.length],
  ];
  for (let i = 3; i < 12; i++) pw.push(all[bytes[i] % all.length]);
  // Cryptographically-secure Fisher–Yates shuffle (Math.random is not safe here)
  for (let i = pw.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [pw[i], pw[j]] = [pw[j], pw[i]];
  }
  return pw.join('');
}

async function main() {
  console.log('🌱  Seeding database …');

  // ── Admin user ────────────────────────────────────────────────────────────
  const existingAdmin = await prisma.user.findUnique({ where: { username: 'admin' } });
  let adminPassword = null;

  if (!existingAdmin) {
    adminPassword = generatePassword();
    const hash = await bcrypt.hash(adminPassword, 12);
    await prisma.user.create({
      data: {
        username: 'admin',
        email: 'admin@shreyas.local',
        passwordHash: hash,
        displayName: 'Shreyas Admin',
        mustChangePassword: true,   // force change on first login
      },
    });
    console.log(`  ✓ Admin user created`);

    // Write credentials to a file — NEVER print the password to stdout.
    // On installed/service deployments stdout goes to service.log where the
    // password would sit in plaintext and nobody would see it.
    const credDir  = path.resolve(__dirname, '..', 'storage');
    const credFile = path.join(credDir, 'initial-admin-credentials.txt');
    fs.mkdirSync(credDir, { recursive: true });
    fs.writeFileSync(credFile,
      `Smart MSL Monitor – initial admin credentials\n` +
      `Generated: ${new Date().toISOString()}\n\n` +
      `Username : admin\n` +
      `Password : ${adminPassword}\n\n` +
      `You will be asked to set a new password on first login.\n` +
      `Delete this file after logging in.\n`,
      { encoding: 'utf8', mode: 0o600 }
    );
    console.log(`  ✓ Admin credentials written to: ${credFile}`);
  } else {
    console.log('  ℹ Admin user already exists – skipping password generation');
  }

  // ── Global MSL default ───────────────────────────────────────────────────
  await prisma.mslGlobalDefault.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, minQty: 100, maxQty: 500 },
  });
  console.log('  ✓ MSL global default: Min 100 / Max 500');

  // ── Default reminder rules ────────────────────────────────────────────────
  const offsets = [10, 5, 3, 1];
  for (const days of offsets) {
    const rule = await prisma.reminderRule.upsert({
      where: { id: days },   // use days as id for idempotency
      update: {},
      create: {
        id: days,
        name: `${days} day${days > 1 ? 's' : ''} before due`,
        daysBeforeDue: days,
        isDefault: true,
      },
    });
    console.log(`  ✓ Reminder rule: ${rule.name}`);
  }

  // ── Demo customer ─────────────────────────────────────────────────────────
  const customer = await prisma.customer.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      name: 'Kirloskar Toyota Textile Machinery Pvt Ltd',
      supplierCode: 'S0965',
      contactName: 'Kirloskar Toyota Purchase',
      contactEmail: 'purchase@kirloskar-toyota.local',
      contactWhatsapp: '',
      notes: 'Demo customer. Sends monthly forecast by 5th of each month.',
      notifyWhatsapp: true,
      notifyEmail: true,
      reminderOffsets: JSON.stringify([10, 5, 3, 1]),
    },
  });
  console.log(`  ✓ Customer: ${customer.name}`);

  // ── Default app settings ──────────────────────────────────────────────────
  const settings = [
    { key: 'smtp_host',        value: '',                 isSecret: false },
    { key: 'smtp_port',        value: '587',              isSecret: false },
    { key: 'smtp_user',        value: '',                 isSecret: false },
    { key: 'smtp_pass',        value: '',                 isSecret: true  },
    { key: 'smtp_from',        value: '',                 isSecret: false },
    // smtp_allow_invalid_cert: set to 'true' only for self-signed cert SMTP servers
    { key: 'smtp_allow_invalid_cert', value: 'false',    isSecret: false },
    { key: 'recipient_email',  value: '',                 isSecret: false },
    { key: 'recipient_whatsapp', value: '',               isSecret: false },
    { key: 'timezone',         value: 'Asia/Kolkata',     isSecret: false },
    { key: 'app_theme',        value: 'light',            isSecret: false },
    { key: 'app_name',         value: 'Smart MSL Monitor', isSecret: false },
    { key: 'backup_keep_days', value: '14',               isSecret: false },
    { key: 'scheduler_interval_sec', value: '30',         isSecret: false },
    {
      key: 'tpl_whatsapp_reminder',
      value: `Delivery Reminder\n\nCustomer: {{customerName}}\nPart: {{partName}} ({{partNumber}})\nTotal: {{totalQty}} | Min: {{minQty}} | Max: {{maxQty}}\nDelivery due: {{dueDate}}\n\nReply with a number:\n1 – Remind me later\n2 – Remind me at a specific date & time\n3 – Delivered – stop messages`,
      isSecret: false,
    },
    {
      key: 'tpl_email_reminder_subject',
      value: 'Delivery Reminder: {{customerName}} – due {{dueDate}}',
      isSecret: false,
    },
    {
      key: 'tpl_email_reminder_body',
      value: `<p>Dear Team,</p>\n<p>This is a reminder that the following delivery is due on <strong>{{dueDate}}</strong>.</p>\n<p><strong>Customer:</strong> {{customerName}}<br/><strong>Part:</strong> {{partName}} ({{partNumber}})<br/><strong>Total:</strong> {{totalQty}} | Min: {{minQty}} | Max: {{maxQty}}</p>\n<p>Please log into the app for full details.</p>`,
      isSecret: false,
    },
  ];

  for (const s of settings) {
    await prisma.appSetting.upsert({
      where: { key: s.key },
      update: {},
      create: s,
    });
  }
  console.log(`  ✓ ${settings.length} app settings initialised`);

  // ── Demo forecast + delivery ──────────────────────────────────────────────
  const existingForecast = await prisma.forecast.findFirst({ where: { customerId: 1 } });
  if (!existingForecast) {
    const forecast = await prisma.forecast.create({
      data: {
        customerId: 1,
        forecastMonth: '2027-02',
        sentDate: new Date('2026-11-05'),
        filePath: '/storage/uploads/customer_1/2027-02/v1_demo.pdf',
        fileName: 'KTTM_FEB-2027_forecast.pdf',
        fileType: 'pdf',
        version: 1,
        parserConfidence: 0.97,
        status: 'active',
      },
    });

    const demoItems = [
      { partNumber: '71109-06001-00', partName: 'SCREW,STUD',           totalQty: 2     },
      { partNumber: '83109-30005',    partName: 'BOLT,HEX',             totalQty: 6     },
      { partNumber: '94220-00800',    partName: 'NUT,WELD(M8*1.25)',    totalQty: 31655 },
      { partNumber: '90119-06008',    partName: 'BOLT (6X8)',           totalQty: 330   },
      { partNumber: '90149-06039',    partName: 'NUT (6X1)',            totalQty: 248   },
      { partNumber: '93504-06016',    partName: 'SCREW (6X16)',         totalQty: 10    },
      { partNumber: '90080-14048',    partName: 'BOLT (14X48)',         totalQty: 180   },
      { partNumber: '90119-08020',    partName: 'BOLT (8X20)',          totalQty: 78911 },
    ];

    const delivery = await prisma.delivery.create({
      data: {
        customerId: 1,
        forecastId: forecast.id,
        forecastMonth: '2027-02',
        startDate: new Date('2027-01-20'),
        dueDate: new Date('2027-02-20'),
        status: 'active',
      },
    });

    // Snapshot MSL: global default min=100, max=500
    await prisma.deliveryItem.createMany({
      data: demoItems.map((item, idx) => {
        let status;
        if (item.totalQty < 100)  status = 'BELOW_MIN';
        else if (item.totalQty > 500) status = 'ABOVE_MAX';
        else status = 'NORMAL';
        return {
          deliveryId: delivery.id,
          partNumber: item.partNumber,
          partName: item.partName,
          totalQty: item.totalQty,
          snapshotMinQty: 100,
          snapshotMaxQty: 500,
          snapshotSource: 'global',
          mslStatus: status,
          rowOrder: idx,
        };
      }),
    });

    console.log(`  ✓ Demo forecast + delivery created (${demoItems.length} parts)`);
    console.log('    → Parts 2, 6, 10 = BELOW_MIN; 78911 = ABOVE_MAX; others NORMAL/BELOW_MIN');
  } else {
    console.log('  ℹ Demo forecast already exists – skipping');
  }

  console.log('\n✅  Seeding complete.');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
