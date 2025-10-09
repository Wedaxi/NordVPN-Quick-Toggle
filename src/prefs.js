import Gio from 'gi://Gio';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

// Import constants
import {NORDVPN_CLIENT, NORDVPN_ICON_NAME, MAX_HISTORY_KEY, MAX_HISTORY_DEFAULT, MAX_HISTORY_MIN, MAX_HISTORY_MAX} from './constants.js';

export default class QuickSettingsNordVPNPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    // Create a preferences page, with a single group
    const page = new Adw.PreferencesPage({
        title: _('General'),
        icon_name: 'dialog-information-symbolic',
    });
    window.add(page);

    const group = new Adw.PreferencesGroup({
        title: _('Behavior'),
        description: _('Configure the behavior of the extension'),
    });
    page.add(group);

    // Create a new preferences row
    window._settings = this.getSettings(this.uuid);
    let maxHistoryRow = new Adw.SpinRow({
      title: _('Max Connection History'), // Get the title from the schema
      icon_name: 'history-symbolic', 
      adjustment: new Gtk.Adjustment({
        lower: MAX_HISTORY_MIN,
        upper: MAX_HISTORY_MAX,
        step_increment: 1,
        page_increment: 5,
        page_size: 0,
      }),
      climb_rate: 1,
      digits: 0,
    });
    // Set the default value from the schema
    maxHistoryRow.adjustment.set_value(window._settings.get_int(MAX_HISTORY_KEY));
    maxHistoryRow.set_tooltip_text(_('This extension can remember up to 5 most recently connected countries. Default is 3.'));
    group.add(maxHistoryRow);

    // Bind the max-history to the `show-indicator` key
    window._settings.bind(
      MAX_HISTORY_KEY, 
      maxHistoryRow, 
      'value',
      Gio.SettingsBindFlags.DEFAULT
    );
  }
}