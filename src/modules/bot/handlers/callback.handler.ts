import { BotService } from '../bot.service';

export class CallbackHandler {
  constructor(private readonly botService: BotService) {}

  async handle(query: any): Promise<void> {
    const { id, data, message, from } = query;
    const chatId = message.chat.id;
    const userId = from.id;

    try {
      await this.botService.answerCallback(id);
    } catch (error) {
      console.error('Error answering callback:', error.message);
    }

    const isMember = await this.botService.ensureMembership(userId, chatId);
    if (!isMember) return;

    const handlers: Record<string, () => void> = {
      'approve_order_': () => this.botService.approveOrder(data, chatId, userId).catch(console.error),
      'reject_order_': () => this.botService.rejectOrder(data, chatId, userId).catch(console.error),
      'plan_': () => this.botService.selectPlan(chatId, userId, data).catch(console.error),
      'send_receipt_': () => this.botService.waitForReceipt(chatId, userId, data).catch(console.error),
      'service_detail_': () => this.botService.showServiceDetail(chatId, userId, parseInt(data.split('_')[2])).catch(console.error),
      'copy_config_': () => this.botService.copyConfigLink(chatId, userId, data.substring(12)).catch(console.error),
      'get_config_link_': () => this.botService.sendConfigLink(chatId, userId, parseInt(data.split('_')[3])).catch(console.error),
      'admin_select_plan_for_config_': () => this.botService.startAddConfig(chatId, userId, data).catch(console.error),
      'admin_select_plan_': () => this.botService.showPlanDetail(chatId, data).catch(console.error),
      'admin_toggle_plan_': () => this.botService.togglePlanStatus(chatId, userId, data).catch(console.error),
      'admin_delete_plan_': () => this.botService.deletePlan(chatId, userId, data).catch(console.error),
      'admin_select_plan_for_edit_': () => this.botService.startEditPlanById(chatId, userId, data).catch(console.error),
      'admin_list_configs': () => this.botService.listConfigs(chatId, userId),
      'admin_show_configs_': () => this.botService.showPlanConfigs(chatId, userId, parseInt(data.split('_')[3])),
      'admin_add_config_to_plan_': () => this.botService.startAddConfig(chatId, userId, data),
      'admin_plans_menu': () => this.botService.showPlansManagement(chatId, userId),
      'admin_subs_menu': () => this.botService.showSubsManagement(chatId, userId),
      'admin_configs_menu': () => this.botService.showConfigsManagement(chatId, userId),
      'admin_orders_menu': () => this.botService.showOrdersManagement(chatId, userId),
      'admin_add_plan': () => this.botService.startAddPlan(chatId, userId),
      'admin_list_plans': () => this.botService.showPlansList(chatId, userId),
      'admin_edit_plan': () => this.botService.startEditPlan(chatId, userId),
      'admin_delete_plan': () => this.botService.startDeletePlan(chatId, userId),
      'admin_toggle_plan': () => this.botService.startTogglePlan(chatId, userId),
      'admin_view_sub': () => this.botService.showSub(chatId, userId),
      'admin_edit_sub': () => this.botService.startEditSub(chatId, userId),
      'admin_delete_sub': () => this.botService.deleteSub(chatId, userId),
      'admin_add_config_to_plan': () => this.botService.showPlansForConfig(chatId, userId),
      'admin_delete_config': () => this.botService.startDeleteConfig(chatId, userId),
      'admin_list_orders': () => this.botService.listAllOrders(chatId, userId),
      'admin_pending_orders': () => this.botService.listPendingOrders(chatId, userId),
      'admin_approved_orders': () => this.botService.listApprovedOrders(chatId, userId),
      'admin_rejected_orders': () => this.botService.listRejectedOrders(chatId, userId),
      'check_membership': () => this.botService.checkMembership(chatId, userId),
      'my_services': () => this.botService.showUserServices(chatId, userId),
      'buy': () => this.botService.showPlans(chatId, userId),
      'admin_menu': () => this.botService.showAdminPanel(chatId, userId),
      'admin_back': () => this.botService.showAdminPanel(chatId, userId),
      'main_menu': () => this.botService.handleStart({ chat: { id: chatId, first_name: 'کاربر' }, from: { id: userId } }),
      'back_to_services': () => this.botService.showUserServices(chatId, userId),
    };

    for (const [prefix, handler] of Object.entries(handlers)) {
      if (data.startsWith(prefix)) {
        handler();
        return;
      }
    }
  }
}