import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { formatCentsUsd } from '../subscription/plan-catalog.js';

export type InvoicePdfInput = {
  invoiceNumber: string;
  issuedAt: Date | null;
  dueAt: Date | null;
  status: string;
  currency: string;
  subtotalCents: number;
  totalCents: number;
  customerName: string;
  customerBillingEmail: string;
  organizationName: string;
  planName: string;
  billingPeriodStart: Date;
  billingPeriodEnd: Date;
  type: string;
  paymentInstructions: string | null;
  supportEmail: string;
};

@Injectable()
export class InvoicePdfService {
  render(input: InvoicePdfInput): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 48 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fillColor('#1a2744').fontSize(20).text('FieldOps Cloud');
      doc.moveDown(0.25);
      doc.fillColor('#5b6475').fontSize(10).text('Invoice');
      doc.moveDown(1);

      doc.fillColor('#1a2744').fontSize(12).text(`Invoice ${input.invoiceNumber}`);
      doc.fontSize(10).fillColor('#5b6475');
      doc.text(`Status: ${input.status}`);
      doc.text(`Issued: ${formatDate(input.issuedAt)}`);
      doc.text(`Due: ${formatDate(input.dueAt)}`);
      doc.moveDown(1);

      doc.fillColor('#1a2744').fontSize(11).text('Bill to');
      doc.fillColor('#5b6475').fontSize(10);
      doc.text(input.customerName || input.organizationName);
      doc.text(input.customerBillingEmail);
      doc.moveDown(1);

      doc.fillColor('#1a2744').fontSize(11).text('Description');
      doc.fillColor('#5b6475').fontSize(10);
      doc.text(`FieldOps Cloud ${input.planName} Annual Subscription`);
      doc.text(`Type: ${input.type.replaceAll('_', ' ')}`);
      doc.text(
        `Billing period: ${formatDate(input.billingPeriodStart)} – ${formatDate(input.billingPeriodEnd)}`,
      );
      doc.moveDown(1);

      doc.fillColor('#1a2744').fontSize(11).text('Amount');
      doc.fillColor('#5b6475').fontSize(10);
      doc.text(`Subtotal: ${formatCentsUsd(input.subtotalCents)} ${input.currency}`);
      doc.text(`Total: ${formatCentsUsd(input.totalCents)} ${input.currency}`);
      doc.moveDown(1);

      if (input.paymentInstructions) {
        doc.fillColor('#1a2744').fontSize(11).text('Payment instructions');
        doc.fillColor('#5b6475').fontSize(10).text(input.paymentInstructions, {
          width: 500,
        });
        doc.moveDown(1);
      }

      doc.fillColor('#1a2744').fontSize(10).text('Support');
      doc.fillColor('#5b6475').text(input.supportEmail);
      doc.moveDown(1);
      doc.fontSize(9).text(
        'Please verify that payment instructions were received through your authenticated FieldOps account or an official FieldOps email address.',
        { width: 500 },
      );
      doc.moveDown(0.5);
      doc.text(
        'FieldOps Cloud will never ask you to provide your password, full card number, CVV, or authentication credentials by email, support message, or chat.',
        { width: 500 },
      );

      doc.end();
    });
  }
}

function formatDate(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : '—';
}
