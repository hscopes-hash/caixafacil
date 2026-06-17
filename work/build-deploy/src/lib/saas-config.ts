/**
 * saas-config.ts — Configurações centralizadas do SaaS (via ENV vars)
 *
 * Todas as configurações sensíveis do sistema (IA, MercadoPago, admin)
 * são resolvidas primero por ENV var, depois por DB (compatibilidade).
 */

/** Email do super administrador */
export const SUPER_ADMIN_EMAIL: string = process.env.SUPER_ADMIN_EMAIL || 'hscopes@gmail.com';
