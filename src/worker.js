/*
 * moleculer-faktory
 * Copyright (c) 2019 YourSoft.run (https://github.com/YourSoftRun/moleculer-faktory)
 * MIT Licensed
 */

'use strict'
const { Worker } = require('faktory-worker')

module.exports = {
  name: 'faktory',

  /**
	 * Default settings
	 */
  settings: {
    $secureSettings: ['faktory'],
    faktory: {
      /** @type {String} Faktory url (tcp://:passqueue@localhost:7419/) also FAKTORY_URL can be use. */
      url: 'tcp://:passqueue@localhost:7419',
      /** @type {Object?} Additional options for `new Worker()` */
      options: {
        concurrency: 5,
        queues: ['default'],
        timeout: 25 * 1000
      },
      /** @type {Array?} Middlewares for faktory */
      middlewares: [],
      /** @type {Boolean?} Enable hooks middleware */
      hooks: true
    }
  },

  actions: {
    async start() {
      await this.$worker.work()
    },
    quiet() {
      this.$worker.quiet()
    },
    'is.quiet'() {
      return this.$worker.quieted
    },
    'jobs'() {
      return this.$worker.inProgress
    },
    async stop() {
      await this.$worker.stop()
    }
  },

  jobs: { },

  methods: {
    async callHook(ctx, job, hook) {
      if (job.args && Array.isArray(job.args)) {
        for (const arg of job.args) {
          if (typeof arg === 'object' && typeof arg[hook] === 'object' && typeof arg[hook].handler === 'string') {
            const { handler, params = {}, meta } = arg[hook]
            return ctx.call(handler, { job, ...params }, meta ? { meta } : undefined)
          }
        }
      }
      return true
    }
  },

  created() {
    const middlewares = [...this.settings.faktory.middlewares]
    if (this.settings.faktory.hooks) {
      middlewares.push(async ({ job }, next) => {
        this.broker.emit(`faktory.jobs.${job.jobtype}.start`, job)
        if ((await this.callHook(this.broker, job, 'start')) !== false) {
          await next()
          await this.callHook(this.broker, job, 'end')
          this.broker.emit(`faktory.jobs.${job.jobtype}.end`, job)
        }
      })
    }
    middlewares.unshift(async ({ job }, next) => {
      this.logger.debug(`[Faktory] job ${job.jobtype} started`)
      await next()
      this.logger.debug(`[Faktory] job ${job.jobtype} ended`)
    })
    this.$worker = new Worker({
      url: this.settings.faktory.url,
      ...this.settings.faktory.options,
      middleware: middlewares,
      registry: this.schema.jobs
    })
  },
  async started() {
    this.$worker.work()
    this.logger.info('[Faktory] worker started')
  },
  async stopped() {
    await this.$worker.stop()
    this.logger.info('[Faktory] worker stopped')
  }
}
