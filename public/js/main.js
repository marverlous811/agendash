/* global $, _, Backbone */
$(function () {
  var CurrentRequestModel = Backbone.Model.extend({
    defaults: {
      refreshInterval: 2000,
      overviewFilterRegex: /.*/,
      limit: 20,
      offset: 0,
    }
  })

  var CurrentList = Backbone.Model.extend({
    defaults: {
      job: "",
      state: "",
      length: 0,
      lastOffset: 0,
    }
  })

  var ActiveTitleModel = Backbone.Model.extend({})

  var OverviewItemModel = Backbone.Model.extend({})
  var OverviewItemCollection = Backbone.Collection.extend({
    model: OverviewItemModel
  })

  var JobItemModel = Backbone.Model.extend({
    idAttribute: '_id',
    defaults: {
      selected: false
    }
  })
  var JobItemCollection = Backbone.Collection.extend({
    model: JobItemModel
  })

  var ActiveTitleView = Backbone.View.extend({
    el: '#active-title',
    initialize: function (options) {
      this.activeTitle = options.activeTitle
      _.bindAll(this, 'render')
      this.listenTo(this.activeTitle, 'change', this.render)
    },
    render: function () {
      this.$('.active-job').text(this.activeTitle.get('job'))
      this.$('.active-state').text(this.activeTitle.get('state'))
      return this
    }
  })

  var OverviewItemView = Backbone.View.extend({
    model: OverviewItemModel,
    template: _.template($('#overview-item-template').html()),
    initialize: function () {
      _.bindAll(this, 'render', 'handleClick')
    },
    events: {
      'click [data-state]': 'handleClick'
    },
    handleClick: function (e) {
      App.trigger('requestChange', {
        job: this.model.get('_id'),
        state: $(e.currentTarget).data('state')
      })
    },
    render: function () {
      var html = this.template(this.model.toJSON())
      this.setElement(html)
      return this
    }
  })

  var OverviewListView = Backbone.View.extend({
    el: '#job-overview-list',
    initialize: function (options) {
      this.overviewItems = options.overviewItems
      this.currentRequest = options.currentRequest
      _.bindAll(this, 'render')
      this.listenTo(this.overviewItems, 'update', this.render)
      this.render()
    },
    render: function () {
      var overviewFilterRegex = this.currentRequest.get('overviewFilterRegex')
      this.$el.empty().append(this.overviewItems.filter(function (overviewItem) {
        return overviewFilterRegex.test(overviewItem.get('_id'))
      }).map(function (overviewItem) {
        var overviewItemView = new OverviewItemView({
          model: overviewItem
        })
        return overviewItemView.render().$el
      }))
      return this
    }
  })

  var JobItemView = Backbone.View.extend({
    model: JobItemModel,
    tagName: 'tr',
    template: _.template($('#job-item-template').html()),
    initialize: function () {
      _.bindAll(this, 'render', 'handleClick')
      this.listenTo(this.model, 'change', this.render)
    },
    events: {
      'click': 'handleClick'
    },
    handleClick: function (e) {
      this.model.set('selected', !this.model.get('selected'))
    },
    render: function () {
      this.$el.html(this.template(this.model.toJSON()))
      this.$el.toggleClass('active', this.model.get('selected'))
      return this
    }
  })

  var JobListView = Backbone.View.extend({
    el: '#job-list',
    initialize: function (options) {
      this.jobItems = options.jobItems
      _.bindAll(this, 'render')
      this.listenTo(this.jobItems, 'update', this.render)
      this.render()
    },
    render: _.throttle(function () {
      this.$el.empty().append(this.jobItems.map(function (jobItem) {
        var jobItemView = new JobItemView({
          model: jobItem
        })
        return jobItemView.render().$el
      }))
      return this
    }, 300)
  })

  var SidebarView = Backbone.View.extend({
    el: '#sidebar',
    events: {
      'keyup .overview-filter': 'updateOverviewFilter',
      'change .refresh-interval': 'updateRefreshInterval'
    },
    initialize: function (options) {
      this.currentRequest = options.currentRequest
      _.bindAll(this, 'updateOverviewFilter', 'updateRefreshInterval')
    },
    updateOverviewFilter: function (e) {
      // http://stackoverflow.com/questions/3446170/escape-string-for-use-in-javascript-regex
      var str = $(e.currentTarget).val()
      var newFilterRegex = new RegExp(str.split('').map(function (char) {
        return char.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/, '\\$&')
      }).join('.*'), 'i')
      this.currentRequest.set({
        overviewFilterRegex: newFilterRegex
      })
    },
    updateRefreshInterval: function (e) {
      this.currentRequest.set({
        refreshInterval: +$(e.currentTarget).val() * 1000
      })
    }
  })

  var JobDetailsPaneView = Backbone.View.extend({
    el: '#details-pane',
    initialize: function (options) {
      this.jobItems = options.jobItems
      _.bindAll(this, 'render', 'getSelectedJobs', 'requeueJobs', 'allowDeleteJobs', 'deleteJobs')
      this.listenTo(this.jobItems, 'update', this.render)
      this.listenTo(this.jobItems, 'change', this.render)
      this.render()
    },
    events: {
      'click [data-action=requeue-jobs]': 'requeueJobs',
      'click [data-action=delete-jobs]': 'allowDeleteJobs',
      'click [data-action=delete-jobs].deleteable': 'deleteJobs'
    },
    getSelectedJobs: function () {
      return this.jobItems.where({selected: true})
    },
    render: function () {
      var selectedJobCount = this.getSelectedJobs().length
      this.$('.number-selected').text(selectedJobCount)
      this.$el.toggle(!!selectedJobCount)
      this.$('[data-action=delete-jobs]').removeClass('deleteable').text('Delete selected')
      return this
    },
    requeueJobs: function () {
      var selectedJobIds = this.getSelectedJobs().map(function (j) { return j.get('_id') })
      postJobs('requeue', selectedJobIds)
      .success(function () {
        App.trigger('refreshData')
      })
    },
    allowDeleteJobs: function () {
      this.$('[data-action=delete-jobs]').addClass('deleteable').text('Confirm delete selection')
    },
    deleteJobs: function () {
      var selectedJobIds = this.getSelectedJobs().map(function (j) { return j.get('_id') })
      postJobs('delete', selectedJobIds)
      .success(function () {
        App.trigger('refreshData')
      })
    }
  })

  var JobDetailsListView = Backbone.View.extend({
    el: '#details-list',
    initialize: function (options) {
      this.jobItems = options.jobItems
      _.bindAll(this, 'render')
      this.listenTo(this.jobItems, 'update', this.render)
      this.listenTo(this.jobItems, 'change', this.render)
      this.render()
    },
    render: _.throttle(function () {
      var selectedJobs = this.jobItems
      .where({selected: true})
      .map(function (jobItem) {
        var jobDetailsView = new JobDetailsView({
          model: jobItem
        })
        return jobDetailsView.render().$el
      })
      this.$el.empty().toggle(!!selectedJobs.length).append(selectedJobs)
      return this
    }, 300)
  })

  var JobDetailsView = Backbone.View.extend({
    model: JobItemModel,
    template: _.template($('#job-item-details-template').html()),
    initialize: function () {
      _.bindAll(this, 'render', 'close', 'requeueJob', 'allowDeleteJob', 'deleteJob')
      this.listenTo(this.model, 'change', this.render)
    },
    events: {
      'click .close': 'close',
      'click [data-action=requeue]': 'requeueJob',
      'click [data-action=delete]': 'allowDeleteJob',
      'click [data-action=delete].deleteable': 'deleteJob'
    },
    showJob: function (jobItem) {
      this.model = jobItem
      this.$el.empty().append(this.jobItemDetailsTemplate(jobItem.toJSON()))
    },
    requeueJob: function (e) {
      postJobs('requeue', [this.model.get('job')._id])
      .success(function () {
        $(e.currentTarget).remove()
        App.trigger('refreshData')
      })
    },
    allowDeleteJob: function (e) {
      $(e.currentTarget).addClass('deleteable').text('Confirm deletion')
    },
    deleteJob: function (e) {
      postJobs('delete', [this.model.get('job')._id])
      .success(function () {
        App.trigger('refreshData')
      })
    },
    close: function () {
      this.model.set('selected', false)
    },
    render: function () {
      this.$el.html(this.template(this.model.toJSON()))
      return this
    }
  })

  var SelectJobsView = Backbone.View.extend({
    el: '#select-jobs',
    initialize: function (options) {
      this.jobItems = options.jobItems
      _.bindAll(this, 'selectAll', 'selectNone')
    },
    events: {
      'click [data-action=schedule-job]': 'scheduleJob',
      'click [data-action=select-all]': 'selectAll',
      'click [data-action=select-none]': 'selectNone'
    },
    scheduleJob: function () {
      $(App.createJobPaneView.el).find('input').val('')
      $(App.createJobPaneView.el).show()
    },
    selectAll: function () {
      this.jobItems.forEach(function (jobItem) {
        jobItem.set({selected: true})
      })
    },
    selectNone: function () {
      this.jobItems.forEach(function (jobItem) {
        jobItem.set({selected: false})
      })
    }
  })

  var PagePagination = Backbone.View.extend({
    el: '#page-pagination',
    initialize: function(options){
      this.currentRequest = options.currentRequest;
      this.currentList = options.currentList;
      _.bindAll(this, 'firstPage', 'prevPage', 'nextPage', 'lastPage');
    },
    events: {
      'click [data-action=first-page]' : 'firstPage',
      'click [data-action=prev-page]' : 'prevPage',
      'click [data-action=next-page]' : 'nextPage',
      'click [data-action=last-page]' : 'lastPage',
    },
    firstPage: function(){ 
      this.currentRequest.set('offset',0);
    },
    prevPage: function(){
      const nowOffset = parseInt(this.currentRequest.get('offset'));
      const limit = parseInt(this.currentRequest.get('limit'));
      this.currentRequest.set('offset', nowOffset - limit > 0 ? nowOffset - limit : 0);
    },
    nextPage: function(){
      const nowOffset = parseInt(this.currentRequest.get('offset'));
      const limit = parseInt(this.currentRequest.get('limit'));
      const offset = nowOffset + limit <= this.currentList.get('length') ? nowOffset + limit : this.currentList.get('lastOffset');
      this.currentRequest.set('offset', offset);
    },
    lastPage: function(){
      this.currentRequest.set('offset',this.currentList.get('lastOffset'));
    }
  })

  var CreateJobPaneView = Backbone.View.extend({
    el: '#create-job-pane',
    initialize: function (options) {
      _.bindAll(this, 'render', 'hideView', 'saveJob')
      this.render()
    },
    events: {
      'click [data-action=cancel]': 'hideView',
      'click [data-action=save]': 'saveJob'
    },
    render: function () {
      this.$el.hide()
      return this
    },
    hideView: function () {
      this.$el.hide()
      return this
    },
    saveJob: function () {
      /*
      TODO: Need to validate user input.
      */
      var jobName = this.$el.find('.job-name').val()
      var jobSchedule = this.$el.find('.job-schedule').val()
      var jobRepeatEvery = this.$el.find('.job-repeat-every').val()
      var jobData = JSON.parse(this.$el.find('.job-data').val())
      $.ajax({
        type: 'POST',
        url: 'api/jobs/create',
        data: JSON.stringify({jobName: jobName, jobSchedule: jobSchedule, jobRepeatEvery: jobRepeatEvery, jobData: jobData}),
        contentType: 'application/json',
        dataType: 'json'
      })
      this.$el.hide()
      return this
    }
  })

  var AppView = Backbone.View.extend({
    el: '#app',
    initialize: function () {
      _.bindAll(this,
        'handleRequestChange',
        'handleShowJobDetails',
        'fetchData',
        'resultsFetched',
        'updateNowListStat',
        'updateLastOffset'
      )

      this.activeTitle = new ActiveTitleModel()
      this.currentRequest = new CurrentRequestModel()
      this.overviewItems = new OverviewItemCollection()
      this.jobItems = new JobItemCollection()
      this.currentList = new CurrentList();

      this.activeTitleView = new ActiveTitleView({
        activeTitle: this.activeTitle
      })
      this.sidebarView = new SidebarView({
        currentRequest: this.currentRequest
      })
      this.overviewListView = new OverviewListView({
        currentRequest: this.currentRequest,
        overviewItems: this.overviewItems
      })
      this.jobListView = new JobListView({
        jobItems: this.jobItems
      })
      this.jobDetailsPaneView = new JobDetailsPaneView({
        jobItems: this.jobItems
      })
      this.jobDetailsListView = new JobDetailsListView({
        jobItems: this.jobItems
      })
      this.selectJobsView = new SelectJobsView({
        jobItems: this.jobItems
      })
      this.createJobPaneView = new CreateJobPaneView({
      })
      this.pagePagination = new PagePagination({
        currentRequest: this.currentRequest,
        currentList: this.currentList,
      })

      this.listenTo(this, 'requestChange', this.handleRequestChange)
      this.listenTo(this, 'showJobDetails', this.handleShowJobDetails)
      this.listenTo(this, 'refreshData', this.fetchData)
      this.listenTo(this.currentRequest, 'change', this.fetchData)

      this.fetchData()
    },
    handleRequestChange: function (newRequest) {
      this.currentRequest.set(newRequest)
    },
    handleShowJobDetails: function (jobItem) {
      this.jobDetailsView.showJob(jobItem)
    },
    fetchData: function () {
      this._fetchRequest && this._fetchRequest.abort()
      this._fetchTimeout && clearTimeout(this._fetchTimeout)
      this._fetchRequest = $.get('api', {
        job: this.currentRequest.get('job'),
        state: this.currentRequest.get('state'),
        limit: this.currentRequest.get('limit'),
        offset: this.currentRequest.get('offset')
      }).success(this.resultsFetched)
    },
    resultsFetched: function (results) {
      // console.log("hello ", results.overview);
      this.updateNowListStat(results.overview);
      this.overviewItems.set(results.overview)
      this.activeTitle.set({
        job: results.currentRequest.job,
        state: results.currentRequest.state
      })
      this.render(results)
      this.jobItems.set(results.jobs)
      this._fetchTimeout = setTimeout(this.fetchData, this.currentRequest.get('refreshInterval'))
    },
    updateNowListStat: function(overview){
      const currentJob = this.currentRequest.get("job") || "all";
      const state = this.currentRequest.get("state") || "total"

      this.currentList.set('job', currentJob);
      this.currentList.set('state', state);
      if(currentJob === 'all'){
        this.currentList.set('length', overview[0][state]);
        this.updateLastOffset();
        // console.log(this.currentList.get('length'));
      }
      else{
        let _cur = overview.filter((item) => {
          if(item._id === currentJob){
            this.currentList.set('length', item[state]);
            this.updateLastOffset();
            // console.log(this.currentList.get('length'));
          }
        })
      }
    },
    updateLastOffset: function(){
      const length = this.currentList.get('length');
      const limit = this.currentRequest.get('limit');
      
      if(length <= 0){
        this.currentList.set("lastOffset", 0);
        return;
      }

      let lastOffset = Math.floor(length / limit) * limit;
      this.currentList.set("lastOffset", lastOffset);
      // console.log(this.currentList.get("lastOffset"));
    },
    render: function (results) {
      document.title = results.title
      $('.page-title').text(results.title)
    }
  })

  var App = new AppView()

  function postJobs (action, jobIds) {
    return $.ajax({
      type: 'POST',
      url: 'api/jobs/' + action,
      data: JSON.stringify({jobIds: jobIds}),
      contentType: 'application/json',
      dataType: 'json'
    })
  }
})
