import { Injectable } from '@nestjs/common';
import { ChannelMiddleware } from '../../telegram/middlewares/channel.middleware';
import { AdminMiddleware } from '../../telegram/middlewares/admin.middleware';
import { TelegramSender } from '../utils/telegram-sender';
import { UserHandler } from './user.handler';
import { PlanHandler } from './plan.handler';
import { OrderHandler } from './order.handler';
import { ConfigHandler } from './config.handler';
import { DiscountHandler } from './discount.handler';
import { SubHandler } from './sub.handler';
import { ServiceHandler } from './service.handler';
import { BroadcastHandler } from './broadcast.handler';
import { getMainKeyboard } from '../keyboards/main.keyboard';
import { OrderStatus, BandwidthUnit } from '../../../common/enums';
import { AdminStateManager } from '../states/admin.state';
import { ReferralHandler } from '../../referral/handlers/referral.handler';

@Injectable()
export class CallbackHandler {
  constructor(
    private readonly channelMiddleware: ChannelMiddleware,
    private readonly adminMiddleware: AdminMiddleware,
    private readonly sender: TelegramSender,
    private readonly stateManager: AdminStateManager,
    private readonly userHandler: UserHandler,
    private readonly planHandler: PlanHandler,
    private readonly orderHandler: OrderHandler,
    private readonly configHandler: ConfigHandler,
    private readonly discountHandler: DiscountHandler,
    private readonly subHandler: SubHandler,
    private readonly serviceHandler: ServiceHandler,
    private readonly referralHandler: ReferralHandler,
    private readonly broadcastHandler: BroadcastHandler,
  ) {}

  async handle(bot: any, query: any): Promise<void> {
    const { id, data, message, from } = query;
    const chatId: number = message.chat.id;
    const userId: number = from.id;

    await this.sender.answerCallback(bot, id);

    // Clear any stuck state unless the user is intentionally entering the receipt flow
    // or selecting a bandwidth unit (which requires the add_plan state to persist)
    if (
      !data.startsWith('send_receipt_') &&
      !data.startsWith('plan_unit_gb_') &&
      !data.startsWith('plan_unit_mb_')
    ) {
      this.stateManager.clear(userId);
    }

    const isMember = await this.channelMiddleware.ensureMembership(bot, userId, chatId);
    if (!isMember) return;

    // ─── prefix routing ────────────────────────────────────────────────────────

    // Fix: pass real userId (from.id), NOT the parsed suffix from callback_data
    if (data.startsWith('plan_unit_gb_')) {
      return void this.planHandler.setPlanUnit(bot, chatId, userId, BandwidthUnit.GB);
    }
    if (data.startsWith('plan_unit_mb_')) {
      return void this.planHandler.setPlanUnit(bot, chatId, userId, BandwidthUnit.MB);
    }

    if (data.startsWith('edit_unit_gb_')) {
      return void this.planHandler.editPlanUnit(bot, chatId, userId, BandwidthUnit.GB, parseInt(data.split('_')[3]));
    }
    if (data.startsWith('edit_unit_mb_')) {
      return void this.planHandler.editPlanUnit(bot, chatId, userId, BandwidthUnit.MB, parseInt(data.split('_')[3]));
    }

    if (data.startsWith('approve_order_')) {
      return void this.orderHandler.approveOrder(bot, chatId, userId, parseInt(data.split('_')[2]));
    }
    if (data.startsWith('reject_order_')) {
      return void this.orderHandler.rejectOrder(bot, chatId, userId, parseInt(data.split('_')[2]));
    }
    if (data.startsWith('admin_approve_order_')) {
      return void this.orderHandler.approveOrder(bot, chatId, userId, parseInt(data.split('_')[3]));
    }
    if (data.startsWith('admin_reject_order_')) {
      return void this.orderHandler.rejectOrder(bot, chatId, userId, parseInt(data.split('_')[3]));
    }
    if (data.startsWith('admin_view_receipt_')) {
      return void this.orderHandler.viewReceipt(bot, chatId, userId, parseInt(data.split('_')[3]));
    }
    if (data.startsWith('get_config_link_')) {
      return void this.orderHandler.sendConfigLink(bot, chatId, userId, parseInt(data.split('_')[3]));
    }
    if (data.startsWith('send_receipt_')) {
      return void this.orderHandler.waitForReceipt(bot, chatId, userId, parseInt(data.split('_')[2]));
    }
    if (data.startsWith('service_detail_')) {
      return void this.serviceHandler.showDetail(bot, chatId, userId, parseInt(data.split('_')[2]));
    }

    // plan_ must come AFTER more-specific plan_unit_ prefixes
    if (data.startsWith('plan_')) {
      return void this.userHandler.selectPlan(
        bot, chatId, userId, parseInt(data.split('_')[1]),
        from.username, from.first_name, from.last_name,
      );
    }

    if (data.startsWith('admin_select_plan_for_config_')) {
      return void this.configHandler.startAdd(bot, chatId, userId, parseInt(data.split('_')[5]));
    }
    if (data.startsWith('admin_show_configs_')) {
      return void this.configHandler.showPlanConfigs(bot, chatId, userId, parseInt(data.split('_')[3]));
    }
    if (data.startsWith('admin_configs_filter_available_')) {
      return void this.configHandler.showPlanConfigsFiltered(bot, chatId, userId, parseInt(data.split('_')[4]), 'available');
    }
    if (data.startsWith('admin_configs_filter_sold_')) {
      return void this.configHandler.showPlanConfigsFiltered(bot, chatId, userId, parseInt(data.split('_')[4]), 'sold');
    }
    if (data.startsWith('admin_configs_filter_all_')) {
      return void this.configHandler.showPlanConfigsFiltered(bot, chatId, userId, parseInt(data.split('_')[4]), 'all');
    }
    if (data.startsWith('admin_select_plan_for_edit_')) {
      return void this.planHandler.startEditPlanById(bot, chatId, userId, parseInt(data.split('_')[5]));
    }
    // admin_select_plan_ must come AFTER more-specific admin_select_plan_for_* prefixes
    if (data.startsWith('admin_select_plan_')) {
      return void this.planHandler.showPlanDetail(bot, chatId, parseInt(data.split('_')[3]));
    }
    if (data.startsWith('admin_toggle_plan_')) {
      return void this.planHandler.togglePlanStatus(bot, chatId, userId, parseInt(data.split('_')[3]));
    }
    if (data.startsWith('admin_delete_plan_')) {
      return void this.planHandler.deletePlan(bot, chatId, userId, parseInt(data.split('_')[3]));
    }
    if (data.startsWith('admin_discount_enable_')) {
      return void this.discountHandler.enableDiscount(bot, chatId, userId, parseInt(data.split('_')[3]));
    }
    if (data.startsWith('admin_discount_disable_')) {
      return void this.discountHandler.disableDiscount(bot, chatId, userId, parseInt(data.split('_')[3]));
    }

    // ─── exact routing ─────────────────────────────────────────────────────────
    const exact: Record<string, () => void> = {
      buy:                          () => this.userHandler.showPlans(bot, chatId, userId, from.username, from.first_name, from.last_name),
      my_services:                  () => this.userHandler.showUserServices(bot, chatId, userId),
      main_menu:                    () => this.userHandler.handleStart(bot, chatId, userId, from.first_name, from.last_name),
      back_to_services:             () => this.userHandler.showUserServices(bot, chatId, userId),
      how_to_connect:               () => this.userHandler.handleHowToConnect(bot, chatId),
      check_membership:             () => this.handleCheckMembership(bot, chatId, userId),

      admin_menu:                   () => this.planHandler.showPanel(bot, chatId, userId),
      admin_back:                   () => this.planHandler.showPanel(bot, chatId, userId),
      admin_plans_menu:             () => this.planHandler.showPlansManagement(bot, chatId, userId),
      admin_add_plan:               () => this.planHandler.startAddPlan(bot, chatId, userId),
      admin_list_plans:             () => this.planHandler.showPlansList(bot, chatId, userId),
      admin_edit_plan:              () => this.planHandler.startEditPlan(bot, chatId, userId),
      admin_delete_plan:            () => this.planHandler.startDeletePlan(bot, chatId, userId),
      admin_toggle_plan:            () => this.planHandler.startTogglePlan(bot, chatId, userId),
      admin_add_config_to_plan:     () => this.planHandler.showPlansForConfig(bot, chatId, userId),

      admin_subs_menu:              () => this.subHandler.showSubsManagement(bot, chatId, userId),
      admin_view_sub:               () => this.subHandler.showSub(bot, chatId, userId),
      admin_edit_sub:               () => this.subHandler.startEditSub(bot, chatId, userId),
      admin_delete_sub:             () => this.subHandler.deleteSub(bot, chatId, userId),

      admin_configs_menu:           () => this.configHandler.showConfigsManagement(bot, chatId, userId),
      admin_list_configs:           () => this.configHandler.list(bot, chatId, userId),
      admin_delete_config:          () => this.configHandler.startDelete(bot, chatId, userId),

      admin_orders_menu:            () => this.orderHandler.showOrdersManagement(bot, chatId, userId),
      admin_list_orders:            () => this.orderHandler.listOrders(bot, chatId, userId),
      admin_pending_orders:         () => this.orderHandler.listPendingOrders(bot, chatId, userId),
      // Fix: add missing approved/rejected order routes
      admin_approved_orders:        () => this.orderHandler.listApprovedOrders(bot, chatId, userId),
      admin_rejected_orders:        () => this.orderHandler.listRejectedOrders(bot, chatId, userId),

      admin_discount_menu:          () => this.discountHandler.showMenu(bot, chatId, userId),
      admin_enable_discount:        () => this.discountHandler.showPlansForEnable(bot, chatId, userId),
      admin_disable_discount:       () => this.discountHandler.showPlansForDisable(bot, chatId, userId),
      admin_disable_all_discounts:  () => this.discountHandler.disableAllDiscounts(bot, chatId, userId),

      admin_broadcast:              () => this.broadcastHandler.startBroadcast(bot, chatId, userId),

      invite_friends:               () => this.referralHandler.showInvitePage(bot, chatId, userId),
      copy_invite_link:             () => this.referralHandler.sendInviteLink(bot, chatId, userId),
    };

    exact[data]?.();
  }

  private async handleCheckMembership(bot: any, chatId: number, userId: number): Promise<void> {
    const isMember = await this.channelMiddleware.ensureMembership(bot, userId, chatId);
    if (isMember) {
      const isAdmin = this.adminMiddleware.isAdmin(userId);
      await this.sender.send(bot, chatId, '✅ عضویت تأیید شد!', getMainKeyboard(isAdmin));
    }
  }
}
