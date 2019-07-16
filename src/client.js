/*
 * moleculer-faktory
 * Copyright (c) 2019 YourSoft.run (https://github.com/YourSoftRun/moleculer-faktory)
 * MIT Licensed
 */

'use strict'
const { Client } = require('faktory-worker')

module.exports = {
  /**
	 * Default settings
	 */
  settings: {
    $secureSettings: ['faktory'],
    faktory: {
      /** @type {String} Faktory url (tcp://:passqueue@localhost:7419/) also FAKTORY_URL can be use. */
      url: 'tcp://:passqueue@localhost:7419',
      /** @type {Object?} Additional options for `new Client()` */
      options: { },
      /** @type {Boolean?} Prefix queue name with broker namespace */
      namespaced: false
    }
  },

  created() {
    this.$client = new Client({
      url: this.settings.faktory.url,
      ...this.settings.faktory.options
    })
  },
  methods: {
    async queue(ctx, name, params, hooks) {
      return this.$client.push({ jobtype: name, queue: this.settings.faktory.namespaced && this.broker.namespace ? `${this.broker.namespace}.${name}` : name, args: [params, { hooks, meta: ctx.meta }] })
    }
  },
  async started() {
    await this.$client.connect()
  },
  async stopped() {
    await this.$client.close()
  }
}
