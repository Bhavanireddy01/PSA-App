namespace sprint.common;
 
type ProjectStatus : String enum {
    Draft;
    Active;
    OnHold;
    Completed;
    Cancelled;
}
 
type EmployeeRole : String enum {
    Employee;
    Manager;
    Finance;
    Admin;
}
 
type EmployeeStatus : String enum {
    Active;
    Inactive;
    OnLeave;
}
 
type ClientStatus : String enum {
    Active;
    Inactive;
    Prospect;
}
 
type InvoiceStatus : String enum {
    Draft;
    Issued;
    Paid;
    Overdue;
    Cancelled;
}
 
type DepartmentStatus : String enum {
    Active;
    Inactive;
}
 
type MilestoneStatus : String enum {
    NotStarted;
    InProgress;
    Completed;
    Delayed;
}
 
type TaskStatus : String enum {
    ToDo;
    InProgress;
    Done;
    Blocked;
}
 
type TimesheetStatus : String enum {
    Draft;
    Submitted;
    Approved;
    Rejected;
    Invoiced;
}
 
type BillingType : String enum {
    Fixed;
    TM;
    Retainer;
}
 
type PriorityType : String enum {
    Low;
    Medium;
    High;
    Critical;
}
 
type BudgetStatus : String enum {
    WithinBudget;
    AtRisk;
    Breached;
}
 
type string3    : String(3);
type string20   :String(20);
type string50   :String(50);
type string60   :String(60);
type string100  :String(100);
type string255  :String(255);
type String500  :String(500);
