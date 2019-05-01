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
    async $callHook(ctx, job, hook) {
      if (job.args && typeof job.args[1] === 'object' && typeof job.args[1].hooks === 'object') {
        const { hooks, meta = {} } = job.args[1]
        if (typeof hooks[hook] === 'object' && typeof hooks[hook].handler === 'string') {
          const { handler, params = {}} = hooks[hook]
          return ctx.call(handler, params, { meta: { ...meta, job: job.jid } })
        }
      }
      return true
    },
    async queue(ctx, name, params, hooks) {
      return this.$worker.client.push({ jobtype: name, queue: name, args: [params, { hooks, meta: ctx.meta }] })
    },
    $loadMiddlewares() {
      const middlewares = [...this.settings.faktory.middlewares]
      if (this.settings.faktory.hooks) {
        middlewares.push(async ({ job }, next) => {
          this.broker.emit(`faktory.jobs.${job.jobtype}.start`, job)
          if ((await this.$callHook(this.broker, job, 'start')) !== false) {
            await next()
            await this.$callHook(this.broker, job, 'end')
            this.broker.emit(`faktory.jobs.${job.jobtype}.end`, job)
          }
        })
      }
      middlewares.unshift(async ({ job }, next) => {
        this.logger.debug(`[Faktory] job ${job.jobtype} started`)
        await next()
        this.logger.debug(`[Faktory] job ${job.jobtype} ended`)
      })
      return middlewares
    },
    $jobRegistry() {
      const registry = {}
      for (const action of Object.keys(this.schema.actions)) {
        const { queue } = this.schema.actions[action]
        if (queue) {
          registry[`${this.name}.${action}`] = (params = {}, misc = {}) => async ({ job }) => this.broker.call(`${this.name}.${action}`, params, { meta: { ...misc.meta, job: job.jid } })
        }
      }
      return registry
    }
  },

  created() {
    const registry = this.$jobRegistry()
    this.$worker = new Worker({
      url: this.settings.faktory.url,
      ...this.settings.faktory.options,
      queues: Object.keys(registry),
      middleware: this.$loadMiddlewares(),
      registry
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
