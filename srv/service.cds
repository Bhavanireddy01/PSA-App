using sprint from '../db/schema';



service PSAService  {


 // ---------------------------------------------------------------
    // Return types
    // ---------------------------------------------------------------
    type ManagerKPIs {
        activeProjects   : Integer;
        atRiskBudgets    : Integer;
        pendingApprovals : Integer;
        unbilledHours    : Decimal(10, 2);
    };

    type BillingKPIs {
        unbilledHours : Decimal(10, 2);
        draftInvoices : Integer;
        overdueAmount : Decimal(15, 2);
    };

    type BurnSummary {
        budgetAmt        : Decimal(15, 2);
        consumedAmt      : Decimal(15, 2);
        remainingAmt     : Decimal(15, 2);
        plannedHours     : Decimal(10, 2);
        consumedHours    : Decimal(10, 2);
        burnPercent      : Integer;
        projectedEndDate : Date;
    };

    // ---------------------------------------------------------------
    // MASTER DATA
    // ---------------------------------------------------------------
    entity Clients as projection on sprint.master.Clients actions {
        action ActivateClient()         returns String;
        action DeactivateClient()       returns String;
        action CreateProjectForClient() returns String;
    };

    entity Departments as projection on sprint.master.Departments;
    
    entity Milestones as projection on sprint.ProjectManagement.Milestones;
    entity Tasks      as projection on sprint.ProjectManagement.Tasks;

    // ---------------------------------------------------------------
    // TIME MANAGEMENT
    // ---------------------------------------------------------------
    entity TimesheetEntries as projection on sprint.TimeManagement.TimesheetEntries;
        entity Employees as projection on sprint.master.Employees {
        *,
        firstName || ' ' || lastName as fullName : String(121)
    };

    entity Projects as projection on sprint.ProjectManagement.Projects {
        *,
        virtual null as budgetBurnPercent : Integer,
        case when status = 'Active' then 3
             when status = 'OnHold' then 2
             when status = 'Cancelled' then 1
             else 0 end as statusCriticality : Integer
    } actions {
        action   RecalculateBudget() returns String;
        function GetBurnSummary()    returns BurnSummary;
    };

    entity Budgets as projection on sprint.ProjectManagement.Budgets {
        *,
        case when status = 'WithinBudget' then 3
             when status = 'AtRisk' then 2
             when status = 'Breached' then 1
             else 0 end as statusCriticality : Integer
    };

    entity Timesheets as projection on sprint.TimeManagement.Timesheets {
        *,
        case when status in ('Approved','Invoiced') then 3
             when status = 'Submitted' then 2
             when status = 'Rejected' then 1
             else 0 end as statusCriticality : Integer
    } actions {
        action SubmitTimesheet()                         returns String;
        action ApproveTimesheet(approvedBy : UUID)       returns String;
        action RejectTimesheet(rejectionReason : String) returns String;
    };

    entity Invoices as projection on sprint.billing.Invoices {
        *,
        case when status = 'Paid' then 3
             when status = 'Issued' then 2
             when status = 'Overdue' then 1
             else 0 end as statusCriticality : Integer
    } actions {
        action IssueInvoice()    returns String;
        action MarkInvoicePaid() returns String;
        action CancelInvoice()   returns String;
    };

    


    // ---------------------------------------------------------------
    // KPI FUNCTIONS (dashboards)
    // ---------------------------------------------------------------
    function GetManagerKPIs() returns ManagerKPIs;
    function GetBillingKPIs() returns BillingKPIs;

    // ---------------------------------------------------------------
    // UNBOUND ACTIONS
    // ---------------------------------------------------------------
    action CreateTimesheet(
        employeeID         : UUID,
        weekStartDate      : Date,
        weekEndDate        : Date,
        totalBillableHours : Decimal(10, 2),
        status             : String null,
        submittedDate      : Date null
    ) returns String;

    action UpdateTimesheet(
        TimesheetID        : UUID,
        employeeID         : UUID,
        weekStartDate      : Date,
        weekEndDate        : Date,
        totalBillableHours : Decimal(10, 2),
        status             : String
    ) returns String;

    action DeleteTimesheet(TimesheetID : UUID) returns String;

    action CreateProject(
        clientID      : UUID,
        managerID     : UUID,
        projectCode   : String(20),
        projectName   : String(100),
        description   : String(500),
        billingType   : String,
        startDate     : Date,
        endDate       : Date,
        priority      : String,
        plannedHours  : Decimal(10, 2),
        budgetAmt     : Decimal(15, 2),
        billingRateHr : Decimal(15, 2),
        currencyCode  : String(3)
    ) returns String;

    action UpdateProject(
        ProjectID    : UUID,
        projectName  : String(100),
        description  : String(500),
        startDate    : Date,
        endDate      : Date,
        status       : String,
        priority     : String,
        plannedHours : Decimal(10, 2)
    ) returns String;

    action DeleteProject(ProjectID : UUID) returns String;

    action GenerateInvoice(
        projectID  : UUID,
        periodFrom : Date,
        periodTo   : Date
    ) returns String;

    action CreateEmployee(
        firstName    : String(60),
        lastName     : String(60),
        email        : String(100),
        phoneNo      : String(20),
        jobTitle     : String(60),
        role         : String,
        departmentID : UUID,
        managerID    : UUID,
        joinDate     : Date,
        hourlyRate   : Decimal(15, 2)
    ) returns String;

    action UpdateEmployee(
        EmployeeID   : UUID,
        firstName    : String(60),
        lastName     : String(60),
        phoneNo      : String(20),
        jobTitle     : String(60),
        role         : String,
        departmentID : UUID,
        managerID    : UUID,
        hourlyRate   : Decimal(15, 2),
        status       : String
    ) returns String;

    action DeleteEmployee(EmployeeID : UUID) returns String;
}