/*  s_tran.h -- header file for STRAN routines  */
/*  $Id $  */

/*===============================================================*
 *    S_TRAN - Copyright (c) 2005-13, Stellingwerf Consulting    *
 *    All rights reserved, Use under license agreement only.     *
 *===============================================================*/

#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <stdio.h>
#include <ctype.h>


#define VERSION  4.14               /*  code version set here  */


/*=====================================================================*/

                                                /*  handy macros  */
#define sq( x )         ((x) * (x))
#define cub( x )        ((x) * (x) * (x))
#define cbrt( x )       (pow( (x), (1./3.) ))
#define quad( x )       ((x) * (x) * (x) * (x))
#define fmin( x, y )    ((x) < (y) ? (x) : (y))
#define fmax( x, y )    ((x) > (y) ? (x) : (y))
#define fabs(x)     ((x) < 0 ? (-x) : (x))

                                                /*  some numbers  */
#define ESC     27
#define HUGER   1.e35
#define ERR_VAL -999999990

#define MISS    -99999
#define MISSING -99999
                                                /*  constants  */

#define PI          3.14159265  /*  pi  */

                                                /*  logic  */
#define LOGICAL     int

#define TRUE        1
#define FALSE       0

/*=============== definitions ==============================================*/

#define MAX_COMMANDS   1000000000       /*  do not dimension on this!  */
#define MAX_LINES     10000
#define MAX_FIELDS    128
#define LINE_LEN      512
#define FIELD_LEN     128
#define MAX_ARGS      100
#define NOOP           99
#define LAB_LEN        25
#define STRING_LEN   1024

                                           /*  regression types (reglog) */
#define LINEAR          0
#define LOGLOG          1
#define LOGLIN          2
#define LINLOG          3

/*======================data================================================*/
                                                
EXTERN char stmp[LINE_LEN+1], path_name[LINE_LEN+1], input_file[LINE_LEN+1], gstring[STRING_LEN+1];

EXTERN LOGICAL debug, single_step, end_of_file, query_result, data_error, noexit, constant_value;

EXTERN int column_width, reglog, decimals, field_width, nfields;

EXTERN int DEBUG_INP, DEBUG_IF, DEBUG_LOOP;


/*==============  include prototypes here  ===============================  */

#include "proto.h"

