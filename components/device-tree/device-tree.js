var engineeringIcons = require('../../utils/engineering-icons.js');

Component({
  properties: {
    rows: {
      type: Array,
      value: [],
      observer: function (rows) {
        this.setData({
          displayRows: (rows || []).map(function (item) {
            return Object.assign({}, item, { iconPath: engineeringIcons.forNodeType(item.type) });
          })
        });
      }
    },
    selectedId: { type: String, value: '' }
  },
  data: { displayRows: [] },
  methods: {
    onNodeTap: function (e) {
      var id = e.currentTarget.dataset.id;
      var node = null;
      for (var i = 0; i < this.data.displayRows.length; i++) if (this.data.displayRows[i].id === id) node = this.data.displayRows[i];
      this.triggerEvent('nodetap', { id: id, node: node });
    }
  }
});
