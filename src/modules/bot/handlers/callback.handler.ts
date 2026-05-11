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

    const subHandler = this.botService.subHandler;
    const planHandler = this.botService.planHandler;
    const userHandler = this.botService.userHandler;
    const orderHandler = this.botService.orderHandler;
    const configHandler = this.botService.configHandler;
    const discountHandler = this.botService.discountHandler;
    const serviceHandler = this.botService.serviceHandler;

    const handlers: Record<string, () => void> = {
      'approve_order_': () => orderHandler.approveOrder(data, chatId, userId).catch(console.error),
      'reject_order_': () => orderHandler.rejectOrder(data, chatId, userId).catch(console.error),
      'plan_': () => userHandler.selectPlan(chatId, userId, data).catch(console.error),
      'send_receipt_': () => orderHandler.waitForReceipt(chatId, userId, data).catch(console.error),
      'service_detail_': () => serviceHandler.showDetail(chatId, userId, parseInt(data.split('_')[2])).catch(console.error),
      'copy_config_': () => serviceHandler.copyConfigLink(chatId, userId, data.substring(12)).catch(console.error),
      'get_config_link_': () => orderHandler.sendConfigLink(chatId, userId, parseInt(data.split('_')[3])).catch(console.error),
      'admin_select_plan_for_config_': () => configHandler.startAdd(chatId, userId, data).catch(console.error),
      'admin_select_plan_': () => planHandler.showPlanDetail(chatId, data).catch(console.error),
      'admin_toggle_plan_': () => planHandler.togglePlanStatus(chatId, userId, data).catch(console.error),
      'admin_delete_plan_': () => planHandler.deletePlan(chatId, userId, data).catch(console.error),
      'admin_select_plan_for_edit_': () => planHandler.startEditPlanById(chatId, userId, data).catch(console.error),
      'admin_list_configs': () => configHandler.list(chatId, userId),
      'admin_show_configs_': () => configHandler.showPlanConfigs(chatId, userId, parseInt(data.split('_')[3])),
      'admin_add_config_to_plan_': () => configHandler.startAdd(chatId, userId, data),
      'admin_plans_menu': () => planHandler.showPlansManagement(chatId, userId),
      'admin_subs_menu': () => subHandler.showSubsManagement(chatId, userId),
      'admin_configs_menu': () => configHandler.showConfigsManagement(chatId, userId),
      'admin_orders_menu': () => orderHandler.showOrdersManagement(chatId, userId),
      'admin_discount_menu': () => discountHandler.showMenu(chatId, userId),
      'admin_enable_discount': () => discountHandler.showPlansForEnable(chatId, userId),
      'admin_disable_discount': () => discountHandler.showPlansForDisable(chatId, userId),
      'admin_discount_enable_': () => discountHandler.enable(chatId, userId, parseInt(data.split('_')[3])),
      'admin_discount_disable_': () => discountHandler.disable(chatId, userId, parseInt(data.split('_')[3])),
      'admin_add_plan': () => planHandler.startAddPlan(chatId, userId),
      'admin_list_plans': () => planHandler.showPlansList(chatId, userId),
      'admin_edit_plan': () => planHandler.startEditPlan(chatId, userId),
      'admin_delete_plan': () => planHandler.startDeletePlan(chatId, userId),
      'admin_toggle_plan': () => planHandler.startTogglePlan(chatId, userId),
      'admin_view_sub': () => subHandler.showSub(chatId, userId),
      'admin_edit_sub': () => subHandler.startEditSub(chatId, userId),
      'admin_delete_sub': () => subHandler.deleteSub(chatId, userId),
      'admin_add_config_to_plan': () => planHandler.showPlansForConfig(chatId, userId),
      'admin_delete_config': () => configHandler.startDelete(chatId, userId),
      'admin_list_orders': () => orderHandler.listAllOrders(chatId, userId),
      'admin_pending_orders': () => orderHandler.listPendingOrders(chatId, userId),
      'admin_approved_orders': () => orderHandler.listApprovedOrders(chatId, userId),
      'admin_rejected_orders': () => orderHandler.listRejectedOrders(chatId, userId),
      'check_membership': () => this.botService.checkMembership(chatId, userId),
      'my_services': () => userHandler.showUserServices(chatId, userId),
      'buy': () => userHandler.showPlans(chatId, userId),
      'admin_menu': () => planHandler.showPanel(chatId, userId),
      'admin_back': () => planHandler.showPanel(chatId, userId),
      'main_menu': () => userHandler.handleStart(chatId, userId, 'کاربر'),
      'back_to_services': () => userHandler.showUserServices(chatId, userId),
    };

    for (const [prefix, handler] of Object.entries(handlers)) {
      if (data.startsWith(prefix)) {
        handler();
        return;
      }
    }
  }
}